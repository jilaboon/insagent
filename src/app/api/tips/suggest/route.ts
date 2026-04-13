import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateText, Output } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import {
  TIP_SUGGESTION_SYSTEM_PROMPT,
  buildTipSuggestionUserPrompt,
} from "@/lib/ai/prompts/tip-suggestion-system";

export const maxDuration = 120;

// ============================================================
// Schema for structured AI output
// ============================================================

const SuggestedTipSchema = z.object({
  suggestions: z.array(
    z.object({
      title: z.string().describe("כותרת קצרה בעברית"),
      body: z.string().describe("תוכן הטיפ — 2-3 משפטים"),
      category: z
        .enum(["חידוש", "כיסוי", "חיסכון", "שירות", "כללי"])
        .describe("קטגוריית הטיפ"),
      triggerHint: z.string().describe("מתי להשתמש בטיפ"),
      reasoning: z.string().describe("איזה דפוס בנתונים הוביל להצעה"),
    })
  ).min(3).max(5),
});

export type SuggestedTip = z.infer<typeof SuggestedTipSchema>["suggestions"][number];

// ============================================================
// Aggregate data queries
// ============================================================

async function getAggregateData() {
  // Total customers
  const totalCustomers = await prisma.customer.count();

  // Age brackets
  const customers = await prisma.customer.findMany({
    select: { age: true },
  });

  const ageBrackets: Record<string, number> = {
    "מתחת ל-30": 0,
    "30-39": 0,
    "40-49": 0,
    "50-59": 0,
    "60+": 0,
    "גיל לא ידוע": 0,
  };

  for (const c of customers) {
    if (c.age == null) ageBrackets["גיל לא ידוע"]++;
    else if (c.age < 30) ageBrackets["מתחת ל-30"]++;
    else if (c.age < 40) ageBrackets["30-39"]++;
    else if (c.age < 50) ageBrackets["40-49"]++;
    else if (c.age < 60) ageBrackets["50-59"]++;
    else ageBrackets["60+"]++;
  }

  // Policy category distribution
  const categoryGroups = await prisma.policy.groupBy({
    by: ["category"],
    _count: { id: true },
    where: { status: "ACTIVE" },
  });

  const categoryDistribution: Record<string, number> = {};
  for (const g of categoryGroups) {
    categoryDistribution[g.category] = g._count.id;
  }

  // Single vs multi-category customers
  const customerCategories = await prisma.policy.groupBy({
    by: ["customerId"],
    _count: { category: true },
    where: { status: "ACTIVE" },
  });

  // Get distinct category count per customer
  const customerCategoryMap = new Map<string, Set<string>>();
  const allPolicies = await prisma.policy.findMany({
    where: { status: "ACTIVE" },
    select: { customerId: true, category: true },
  });

  for (const p of allPolicies) {
    if (!customerCategoryMap.has(p.customerId)) {
      customerCategoryMap.set(p.customerId, new Set());
    }
    customerCategoryMap.get(p.customerId)!.add(p.category);
  }

  let singleCategoryCustomers = 0;
  let multiCategoryCustomers = 0;
  for (const cats of customerCategoryMap.values()) {
    if (cats.size === 1) singleCategoryCustomers++;
    else multiCategoryCustomers++;
  }

  // Average policies per customer
  const totalActivePolicies = await prisma.policy.count({
    where: { status: "ACTIVE" },
  });
  const customersWithPolicies = customerCategories.length;
  const avgPoliciesPerCustomer =
    customersWithPolicies > 0
      ? totalActivePolicies / customersWithPolicies
      : 0;

  // High savings customers (accumulated > 100K)
  const highSavingsCustomers = await prisma.policy.groupBy({
    by: ["customerId"],
    _sum: { accumulatedSavings: true },
    having: {
      accumulatedSavings: {
        _sum: { gt: 100000 },
      },
    },
  });

  // Expiring policies in next 90 days
  const now = new Date();
  const in90Days = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
  const expiringIn90Days = await prisma.policy.count({
    where: {
      status: "ACTIVE",
      endDate: {
        gte: now,
        lte: in90Days,
      },
    },
  });

  // Most common insurers
  const insurerGroups = await prisma.policy.groupBy({
    by: ["insurer"],
    _count: { id: true },
    where: { status: "ACTIVE" },
    orderBy: { _count: { id: "desc" } },
    take: 10,
  });

  const topInsurers = insurerGroups.map((g) => ({
    insurer: g.insurer,
    count: g._count.id,
  }));

  // Customers with no health insurance
  const customersWithHealth = await prisma.policy.findMany({
    where: {
      status: "ACTIVE",
      category: "HEALTH",
    },
    select: { customerId: true },
    distinct: ["customerId"],
  });
  const healthCustomerIds = new Set(customersWithHealth.map((p) => p.customerId));
  const noHealthInsurance = totalCustomers - healthCustomerIds.size;

  // Branch analysis: life vs elementary
  const LIFE_CATEGORIES = ["LIFE", "HEALTH", "PENSION", "SAVINGS", "RISK", "PROVIDENT"];

  const lifeBranchCustomerIds = new Set<string>();
  const elementaryBranchCustomerIds = new Set<string>();

  for (const p of allPolicies) {
    if (LIFE_CATEGORIES.includes(p.category)) {
      lifeBranchCustomerIds.add(p.customerId);
    } else {
      elementaryBranchCustomerIds.add(p.customerId);
    }
  }

  let lifeBranchOnly = 0;
  let elementaryBranchOnly = 0;
  let bothBranches = 0;

  const allCustomerIds = new Set([...lifeBranchCustomerIds, ...elementaryBranchCustomerIds]);
  for (const id of allCustomerIds) {
    const hasLife = lifeBranchCustomerIds.has(id);
    const hasElementary = elementaryBranchCustomerIds.has(id);
    if (hasLife && hasElementary) bothBranches++;
    else if (hasLife) lifeBranchOnly++;
    else elementaryBranchOnly++;
  }

  // Policy age distribution
  const policiesWithStart = await prisma.policy.findMany({
    where: { status: "ACTIVE", startDate: { not: null } },
    select: { startDate: true },
  });

  const policyAgeDistribution: Record<string, number> = {
    "פחות משנה": 0,
    "1-3 שנים": 0,
    "3-5 שנים": 0,
    "5-10 שנים": 0,
    "מעל 10 שנים": 0,
  };

  for (const p of policiesWithStart) {
    if (!p.startDate) continue;
    const ageYears =
      (now.getTime() - new Date(p.startDate).getTime()) /
      (365.25 * 24 * 60 * 60 * 1000);
    if (ageYears < 1) policyAgeDistribution["פחות משנה"]++;
    else if (ageYears < 3) policyAgeDistribution["1-3 שנים"]++;
    else if (ageYears < 5) policyAgeDistribution["3-5 שנים"]++;
    else if (ageYears < 10) policyAgeDistribution["5-10 שנים"]++;
    else policyAgeDistribution["מעל 10 שנים"]++;
  }

  return {
    totalCustomers,
    ageBrackets,
    categoryDistribution,
    singleCategoryCustomers,
    multiCategoryCustomers,
    avgPoliciesPerCustomer,
    highSavingsCustomers: highSavingsCustomers.length,
    expiringIn90Days,
    topInsurers,
    noHealthInsurance,
    lifeBranchOnly,
    elementaryBranchOnly,
    bothBranches,
    policyAgeDistribution,
  };
}

// ============================================================
// POST handler
// ============================================================

export async function POST() {
  try {
    // Load aggregate data and existing tips in parallel
    const [aggregateData, existingTips] = await Promise.all([
      getAggregateData(),
      prisma.officeTip.findMany({
        select: { title: true, body: true, category: true },
      }),
    ]);

    const userPrompt = buildTipSuggestionUserPrompt({
      aggregateData,
      existingTips,
    });

    const result = await generateText({
      model: anthropic("claude-haiku-4-5-20251001"),
      output: Output.object({ schema: SuggestedTipSchema }),
      system: TIP_SUGGESTION_SYSTEM_PROMPT,
      prompt: userPrompt,
    });

    const output = result.output;
    if (!output) {
      return NextResponse.json(
        { error: "AI did not return suggestions" },
        { status: 500 }
      );
    }

    return NextResponse.json({ suggestions: output.suggestions });
  } catch (error) {
    console.error("Tip suggestion failed:", error);
    return NextResponse.json(
      { error: "Failed to generate tip suggestions" },
      { status: 500 }
    );
  }
}
