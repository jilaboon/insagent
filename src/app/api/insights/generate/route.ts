import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { allRules } from "@/lib/insights/rules/all-rules";
import { computeScore } from "@/lib/insights/scorer";
import { requireAuth } from "@/lib/auth";
import type { CustomerProfile, CategoryInfo } from "@/lib/insights/rules/types";

export const maxDuration = 300;

/**
 * Batch insight generation — optimized for speed.
 * Loads customers in one query per batch, runs rules in memory,
 * bulk-inserts insights via raw SQL.
 *
 * Body: { offset, limit }
 */
export async function POST(request: NextRequest) {
  const { response: authResponse } = await requireAuth();
  if (authResponse) return authResponse;

  try {
    const body = await request.json();
    const { offset = 0, limit = 200 } = body as {
      offset?: number;
      limit?: number;
    };

    const totalCustomers = await prisma.customer.count();

    // Batch-load customers WITH all their policies in ONE query
    const customers = await prisma.customer.findMany({
      skip: offset,
      take: limit,
      orderBy: { createdAt: "asc" },
      include: {
        policies: {
          include: {
            coverages: true,
            investmentTracks: true,
            managementFees: true,
          },
        },
      },
    });

    // Get existing insight rule IDs for these customers to avoid duplicates
    const customerIds = customers.map((c) => c.id);
    const existingInsights = await prisma.insight.findMany({
      where: { customerId: { in: customerIds }, linkedRuleId: { not: null } },
      select: { customerId: true, linkedRuleId: true },
    });

    const existingSet = new Set(
      existingInsights.map((i) => `${i.customerId}|${i.linkedRuleId}`)
    );

    // Run rules on all customers in memory
    const insightsToCreate: Array<{
      customerId: string;
      category: string;
      title: string;
      summary: string;
      explanation: string;
      whyNow: string;
      urgencyLevel: number;
      dataFreshness: number;
      profileCompleteness: number;
      strengthScore: number;
      branch: string;
      evidenceJson: string;
      generatedBy: string;
      linkedRuleId: string;
    }> = [];

    for (const customer of customers) {
      // Build profile in memory (no extra DB call)
      const profile = buildProfileFromLoaded(customer);

      for (const rule of allRules) {
        // Skip if already exists
        if (existingSet.has(`${customer.id}|${rule.id}`)) continue;

        try {
          const result = rule.evaluate(profile);
          if (!result) continue;

          const score = computeScore(result.scoringHints);

          insightsToCreate.push({
            customerId: customer.id,
            category: result.category,
            title: result.title,
            summary: result.summary,
            explanation: result.explanation,
            whyNow: result.whyNow,
            urgencyLevel: result.urgencyLevel,
            dataFreshness: profile.activePolicies.length > 0 ? 2 : 0,
            profileCompleteness: profile.activePolicies.length >= 3 ? 2 : profile.activePolicies.length >= 1 ? 1 : 0,
            strengthScore: score,
            branch: result.branch,
            evidenceJson: JSON.stringify(result.evidence),
            generatedBy: "DETERMINISTIC",
            linkedRuleId: result.ruleId,
          });
        } catch {
          // Skip failed rules
        }
      }
    }

    // Bulk insert all insights via raw SQL
    let insightsCreated = 0;
    if (insightsToCreate.length > 0) {
      // Insert in sub-batches of 50 to avoid query size limits
      for (let i = 0; i < insightsToCreate.length; i += 50) {
        const batch = insightsToCreate.slice(i, i + 50);
        const values = batch
          .map(
            (ins) =>
              `(gen_random_uuid(), ${esc(ins.customerId)}, ${esc(ins.category)}::"InsightCategory", ${esc(ins.title)}, ${esc(ins.summary)}, ${esc(ins.explanation)}, ${esc(ins.whyNow)}, ${ins.urgencyLevel}, ${ins.dataFreshness}, ${ins.profileCompleteness}, ${ins.strengthScore}, ${esc(ins.branch)}, ${esc(ins.evidenceJson)}::jsonb, 'NEW'::"InsightStatus", ${esc(ins.generatedBy)}, ${esc(ins.linkedRuleId)}, NOW(), NOW())`
          )
          .join(",\n");

        try {
          await prisma.$executeRawUnsafe(`
            INSERT INTO insights (id, "customerId", category, title, summary, explanation, "whyNow", "urgencyLevel", "dataFreshness", "profileCompleteness", "strengthScore", branch, "evidenceJson", status, "generatedBy", "linkedRuleId", "createdAt", "updatedAt")
            VALUES ${values}
            ON CONFLICT DO NOTHING
          `);
          insightsCreated += batch.length;
        } catch (err) {
          console.error("Insight batch insert error:", err);
        }
      }
    }

    return NextResponse.json({
      processed: customers.length,
      insightsCreated,
      totalCustomers,
      done: offset + customers.length >= totalCustomers,
    });
  } catch (error) {
    console.error("Insight generation error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "שגיאה ביצירת תובנות" },
      { status: 500 }
    );
  }
}

// ============================================================
// Build profile from already-loaded customer (no extra DB call)
// ============================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildProfileFromLoaded(customer: any): CustomerProfile {
  const policies = customer.policies || [];

  const activePolicies = policies.filter(
    (p: { status: string }) =>
      p.status === "ACTIVE" || p.status === "FROZEN" || p.status === "ARREARS"
  );

  const categoryBreakdown = new Map<string, CategoryInfo>();
  for (const p of policies) {
    const cat = p.category as string;
    const existing = categoryBreakdown.get(cat) || {
      count: 0,
      activeCount: 0,
      totalPremium: 0,
      policies: [],
    };
    existing.count++;
    if (activePolicies.includes(p)) existing.activeCount++;
    existing.totalPremium += (p.premiumMonthly || 0) + (p.premiumAnnual || 0) / 12;
    existing.policies.push(p);
    categoryBreakdown.set(cat, existing);
  }

  let totalMonthlyPremium = 0;
  let totalAccumulatedSavings = 0;
  let nearestExpiry: Date | null = null;
  let oldestPolicyStartDate: Date | null = null;
  let maxManagementFeePercent: number | null = null;
  let hasLifeBranch = false;
  let hasElementaryBranch = false;

  for (const p of activePolicies) {
    totalMonthlyPremium += p.premiumMonthly || 0;
    if (p.premiumAnnual) totalMonthlyPremium += p.premiumAnnual / 12;
    totalAccumulatedSavings += p.accumulatedSavings || 0;

    if (p.endDate) {
      const end = new Date(p.endDate);
      if (!nearestExpiry || end < nearestExpiry) nearestExpiry = end;
    }
    if (p.startDate) {
      const start = new Date(p.startDate);
      if (!oldestPolicyStartDate || start < oldestPolicyStartDate)
        oldestPolicyStartDate = start;
    }
    for (const fee of p.managementFees || []) {
      if (fee.ratePercent != null) {
        if (maxManagementFeePercent == null || fee.ratePercent > maxManagementFeePercent) {
          maxManagementFeePercent = fee.ratePercent;
        }
      }
    }
    if (p.category === "PROPERTY") hasElementaryBranch = true;
    else hasLifeBranch = true;
  }

  return {
    customer,
    totalMonthlyPremium,
    totalAnnualPremium: totalMonthlyPremium * 12,
    totalAccumulatedSavings,
    categoryBreakdown,
    activePolicies,
    nearestExpiry,
    oldestPolicyStartDate,
    hasLifeBranch,
    hasElementaryBranch,
    maxManagementFeePercent,
  };
}

// ============================================================
// SQL escape helper
// ============================================================

function esc(val: string | null | undefined): string {
  if (val == null) return "NULL";
  return `'${val.replace(/'/g, "''")}'`;
}
