import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { matchRuleToCustomer } from "@/lib/insights/rule-matcher";
import { requireAuth, requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { checkRateLimit, AI_RATE_LIMITS, rateLimitKey } from "@/lib/rate-limit";
import type { CustomerProfile, CategoryInfo } from "@/lib/insights/rules/types";
import type { OfficeRule } from "@prisma/client";

export const maxDuration = 300;

/**
 * Batch insight generation — now driven by DB rules instead of hardcoded rules.
 * Loads all active OfficeRules once, then matches against customers in batches.
 *
 * Body: { offset, limit }
 */
export async function POST(request: NextRequest) {
  const { response: authResponse, email, role } = await requireAuth();
  if (authResponse) return authResponse;

  const roleResponse = requireRole(role, ["OWNER", "MANAGER", "ADMIN"]);
  if (roleResponse) return roleResponse;

  const rl = checkRateLimit(
    rateLimitKey("insightGenerate", email),
    AI_RATE_LIMITS.insightGenerate
  );
  if (rl.limited) {
    return NextResponse.json(
      { error: "חרגת ממגבלת הבקשות — נסה שוב בעוד דקה" },
      { status: 429 }
    );
  }

  try {
    const body = await request.json();
    const { offset = 0, limit = 200 } = body as {
      offset?: number;
      limit?: number;
    };

    // Load ALL active rules from DB once
    const activeRules = await prisma.officeRule.findMany({
      where: { isActive: true },
    });

    const totalCustomers = await prisma.customer.count();

    // Batch-load customers with policies
    const customers = await prisma.customer.findMany({
      skip: offset,
      take: limit,
      orderBy: { createdAt: "asc" },
      include: {
        policies: {
          include: {
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

    // Run rule matching on all customers in memory
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
      const profile = buildProfileFromLoaded(customer);

      for (const rule of activeRules) {
        // Skip if already exists
        if (existingSet.has(`${customer.id}|${rule.id}`)) continue;

        try {
          const matches = matchRuleToCustomer(rule, profile);
          if (!matches) continue;

          // Derive insight metadata from the rule
          const insightCategory = mapRuleCategoryToInsight(rule);
          const branch = deriveBranch(rule, profile);
          const urgency = deriveUrgency(rule, profile);
          const score = deriveScore(rule, profile);

          insightsToCreate.push({
            customerId: customer.id,
            category: insightCategory,
            title: rule.title,
            summary: rule.body,
            explanation: rule.body,
            whyNow: rule.triggerHint || "כלל משרד",
            urgencyLevel: urgency,
            dataFreshness: profile.activePolicies.length > 0 ? 2 : 0,
            profileCompleteness:
              profile.activePolicies.length >= 3
                ? 2
                : profile.activePolicies.length >= 1
                  ? 1
                  : 0,
            strengthScore: score,
            branch,
            evidenceJson: JSON.stringify({
              ruleId: rule.id,
              ruleSource: rule.source,
              triggerCondition: rule.triggerCondition,
            }),
            generatedBy: "RULE",
            linkedRuleId: rule.id,
          });
        } catch {
          // Skip failed rules
        }
      }
    }

    // Bulk insert all insights via raw SQL
    let insightsCreated = 0;
    if (insightsToCreate.length > 0) {
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

    // Update lastInsightRunAt in SystemSettings
    const isDone = offset + customers.length >= totalCustomers;
    if (isDone) {
      await prisma.systemSetting.upsert({
        where: { key: "lastInsightRunAt" },
        update: { value: new Date().toISOString() },
        create: { key: "lastInsightRunAt", value: new Date().toISOString() },
      });
    }

    await logAudit({
      actorEmail: email,
      action: "insights_generated",
      entityType: "insight",
      details: {
        processed: customers.length,
        insightsCreated,
        totalCustomers,
        rulesEvaluated: activeRules.length,
      },
    });

    return NextResponse.json({
      processed: customers.length,
      insightsCreated,
      totalCustomers,
      rulesEvaluated: activeRules.length,
      done: isDone,
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
// Rule metadata derivation helpers
// ============================================================

function mapRuleCategoryToInsight(rule: OfficeRule): string {
  const cat = rule.category?.trim();
  switch (cat) {
    case "חידוש":
      return "EXPIRING_POLICY";
    case "כיסוי":
      return "COVERAGE_GAP";
    case "חיסכון":
      return "MANAGEMENT_FEE_HIGH";
    case "שירות":
      return "AGE_MILESTONE";
    case "כללי":
      return "CROSS_SELL_OPPORTUNITY";
    default:
      return "CROSS_SELL_OPPORTUNITY";
  }
}

function deriveBranch(rule: OfficeRule, profile: CustomerProfile): string {
  const condition = rule.triggerCondition || "";
  // Property-related rules are ELEMENTARY branch
  if (
    condition.includes("policy_category = PROPERTY") ||
    condition.includes("vehicle_age") ||
    condition.includes("policy_subtype = רכב") ||
    condition.includes("policy_subtype = דירה")
  ) {
    return "ELEMENTARY";
  }
  // If customer only has elementary, use ELEMENTARY
  if (profile.hasElementaryBranch && !profile.hasLifeBranch) {
    return "ELEMENTARY";
  }
  return "LIFE";
}

function deriveUrgency(rule: OfficeRule, profile: CustomerProfile): number {
  const condition = rule.triggerCondition || "";
  // Expiring policies are high urgency
  if (condition.includes("has_expiring_policy")) return 2;
  // Age milestones for 65+ are high
  if (condition.includes("age >= 60")) {
    const age = profile.customer.age;
    if (age && age >= 65) return 2;
    return 1;
  }
  // High management fees are medium-high
  if (condition.includes("management_fee >")) return 1;
  // Policy age reviews are medium
  if (condition.includes("policy_age_years")) return 1;
  // Default: low
  return 0;
}

function deriveScore(rule: OfficeRule, profile: CustomerProfile): number {
  let score = 50; // base score

  // Boost for data richness
  if (profile.activePolicies.length >= 3) score += 10;
  if (profile.totalAccumulatedSavings > 100000) score += 10;

  // Boost for urgency-related rules
  const condition = rule.triggerCondition || "";
  if (condition.includes("has_expiring_policy")) score += 20;
  if (condition.includes("management_fee >")) score += 15;
  if (condition.includes("age >= 60")) score += 15;
  if (condition.includes("policy_age_years")) score += 10;

  // Boost for MANUAL source (Rafi's personal tips)
  if (rule.source === "MANUAL") score += 5;

  return Math.max(1, Math.min(100, score));
}

// ============================================================
// SQL escape helper
// ============================================================

function esc(val: string | null | undefined): string {
  if (val == null) return "NULL";
  return `'${val.replace(/'/g, "''")}'`;
}
