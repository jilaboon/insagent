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

  // No rate limit on insight generation — it's role-protected and
  // needs multiple sequential requests to process all customers.

  try {
    const body = await request.json();
    const { offset = 0, limit = 2000 } = body as {
      offset?: number;
      limit?: number;
    };

    // Load rules once (small query, fast)
    const activeRules = await prisma.officeRule.findMany({
      where: { isActive: true },
    });

    // On first batch (offset=0), clear existing insights via fast raw SQL
    if (offset === 0) {
      await prisma.$executeRawUnsafe('DELETE FROM message_drafts WHERE "insightId" IS NOT NULL');
      await prisma.$executeRawUnsafe('DELETE FROM insights');
    }

    // Two simple queries — faster than JOIN through Supabase pooler
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const customerRows: any[] = await prisma.$queryRawUnsafe(
      `SELECT id, "firstName", "lastName", age, gender, "maritalStatus", phone, email, address
       FROM customers ORDER BY "createdAt" ASC OFFSET ${offset} LIMIT ${limit}`
    );

    const customerIds = customerRows.map((c: { id: string }) => c.id);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const policyRows: any[] = customerIds.length > 0
      ? await prisma.$queryRawUnsafe(
          `SELECT id, "customerId", "policyNumber", insurer, category, "subType", status,
                  "premiumMonthly", "premiumAnnual", "accumulatedSavings",
                  "startDate", "endDate", "vehicleYear", "vehiclePlate", "propertyAddress"
           FROM policies WHERE "customerId" = ANY($1)`,
          customerIds
        )
      : [];

    // Group policies by customer
    const policyMap = new Map<string, typeof policyRows>();
    for (const p of policyRows) {
      const arr = policyMap.get(p.customerId) || [];
      arr.push(p);
      policyMap.set(p.customerId, arr);
    }

    const totalCustomers: number = ((await prisma.$queryRawUnsafe(
      'SELECT COUNT(*)::int as cnt FROM customers'
    )) as Array<{ cnt: number }>)[0]?.cnt ?? 0;

    // No dedup needed — we clear all insights on offset=0

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

    for (const custRow of customerRows) {
      const custId = custRow.id;
      const custPolicies = policyMap.get(custId) || [];
      const profile = buildProfileFromRawRows(custRow, custPolicies);

      for (const rule of activeRules) {
        // Skip if already exists

        try {
          const matches = matchRuleToCustomer(rule, profile);
          if (!matches) continue;

          // Derive insight metadata from the rule
          const insightCategory = mapRuleCategoryToInsight(rule);
          const branch = deriveBranch(rule, profile);
          const urgency = deriveUrgency(rule, profile);
          const score = deriveScore(rule, profile);

          insightsToCreate.push({
            customerId: custId,
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
    const isDone = offset + customerIds.length >= totalCustomers;

    // When done, compute rule distribution summary for the UI
    type RuleSummary = {
      ruleId: string;
      title: string;
      triggerCondition: string | null;
      insightCount: number;
      coveragePercent: number;
    };
    let ruleSummary: RuleSummary[] = [];
    let totalInsightsInDb = 0;

    if (isDone) {
      await prisma.systemSetting.upsert({
        where: { key: "lastInsightRunAt" },
        update: { value: new Date().toISOString() },
        create: { key: "lastInsightRunAt", value: new Date().toISOString() },
      });

      // Compute rule impact summary
      const ruleStats = await prisma.$queryRawUnsafe<Array<{
        ruleId: string;
        title: string;
        triggerCondition: string | null;
        cnt: number;
      }>>(`
        SELECT r.id as "ruleId", r.title, r."triggerCondition", COUNT(i.id)::int as cnt
        FROM office_rules r
        LEFT JOIN insights i ON i."linkedRuleId" = r.id
        WHERE r."isActive" = true
        GROUP BY r.id, r.title, r."triggerCondition"
        ORDER BY cnt DESC
      `);

      totalInsightsInDb = await prisma.insight.count();

      ruleSummary = ruleStats.map((r) => ({
        ruleId: r.ruleId,
        title: r.title,
        triggerCondition: r.triggerCondition,
        insightCount: r.cnt,
        coveragePercent: totalCustomers > 0 ? Math.round((r.cnt / totalCustomers) * 100) : 0,
      }));
    }

    await logAudit({
      actorEmail: email,
      action: "insights_generated",
      entityType: "insight",
      details: {
        processed: customerIds.length,
        insightsCreated,
        totalCustomers,
        rulesEvaluated: activeRules.length,
      },
    });

    // Mark staleness cleared — only when the full pass is actually done
    // (paginated calls report `isDone` on the last page). Otherwise a
    // mid-pagination timestamp would falsely hide the staleness banner.
    if (isDone) {
      const now = new Date().toISOString();
      await prisma.systemSetting.upsert({
        where: { key: "lastInsightGenerationAt" },
        create: { key: "lastInsightGenerationAt", value: now },
        update: { value: now },
      });
    }

    return NextResponse.json({
      processed: customerIds.length,
      insightsCreated,
      totalCustomers,
      rulesEvaluated: activeRules.length,
      done: isDone,
      totalInsights: totalInsightsInDb,
      ruleSummary,
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildProfileFromRawRows(customerRow: any, policyRows: any[]): CustomerProfile {
  // Build customer object — columns now match DB names directly (no prefix)
  const customer = {
    id: customerRow.id,
    firstName: customerRow.firstName,
    lastName: customerRow.lastName,
    age: customerRow.age,
    gender: customerRow.gender,
    maritalStatus: customerRow.maritalStatus,
    phone: customerRow.phone,
    email: customerRow.email,
    address: customerRow.address,
    policies: [] as unknown[],
  };

  // Build policy objects — columns match DB names directly
  const policies = policyRows.map((r) => ({
    id: r.id,
    policyNumber: r.policyNumber,
    insurer: r.insurer,
    category: r.category,
    subType: r.subType,
    status: r.status,
    premiumMonthly: r.premiumMonthly ? Number(r.premiumMonthly) : null,
    premiumAnnual: r.premiumAnnual ? Number(r.premiumAnnual) : null,
    accumulatedSavings: r.accumulatedSavings ? Number(r.accumulatedSavings) : null,
    startDate: r.startDate,
    endDate: r.endDate,
    vehicleYear: r.vehicleYear,
    vehiclePlate: r.vehiclePlate,
    propertyAddress: r.propertyAddress,
    managementFees: [],
    coverages: [],
    investmentTracks: [],
  }));

  customer.policies = policies;

  const activePolicies = policies.filter(
    (p) => p.status === "ACTIVE" || p.status === "FROZEN" || p.status === "ARREARS"
  );

  const categoryBreakdown = new Map<string, CategoryInfo>();
  for (const p of policies) {
    const cat = p.category as string;
    const existing = categoryBreakdown.get(cat) || { count: 0, activeCount: 0, totalPremium: 0, policies: [] };
    existing.count++;
    if (activePolicies.includes(p)) existing.activeCount++;
    existing.totalPremium += (p.premiumMonthly || 0) + (p.premiumAnnual || 0) / 12;
    existing.policies.push(p as never);
    categoryBreakdown.set(cat, existing);
  }

  let totalMonthlyPremium = 0;
  let totalAccumulatedSavings = 0;
  let nearestExpiry: Date | null = null;
  let oldestPolicyStartDate: Date | null = null;
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
      if (!oldestPolicyStartDate || start < oldestPolicyStartDate) oldestPolicyStartDate = start;
    }
    if (p.category === "PROPERTY") hasElementaryBranch = true;
    else hasLifeBranch = true;
  }

  return {
    customer: customer as never,
    totalMonthlyPremium,
    totalAnnualPremium: totalMonthlyPremium * 12,
    totalAccumulatedSavings,
    categoryBreakdown,
    activePolicies: activePolicies as never[],
    nearestExpiry,
    oldestPolicyStartDate,
    hasLifeBranch,
    hasElementaryBranch,
    maxManagementFeePercent: null,
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
