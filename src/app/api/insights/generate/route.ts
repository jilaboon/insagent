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
    const { offset = 0, limit = 500 } = body as {
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

    // All data in ONE raw SQL query — customers + policies joined
    const rows: Array<{
      c_id: string; c_firstName: string; c_lastName: string;
      c_age: number | null; c_gender: string | null; c_maritalStatus: string | null;
      c_phone: string | null; c_email: string | null; c_address: string | null;
      p_id: string | null; p_policyNumber: string | null; p_insurer: string | null;
      p_category: string | null; p_subType: string | null; p_status: string | null;
      p_premiumMonthly: number | null; p_premiumAnnual: number | null;
      p_accumulatedSavings: number | null; p_startDate: Date | null;
      p_endDate: Date | null; p_vehicleYear: number | null;
      p_vehiclePlate: string | null; p_propertyAddress: string | null;
    }> = await prisma.$queryRawUnsafe(`
      SELECT
        c.id as c_id, c."firstName" as "c_firstName", c."lastName" as "c_lastName",
        c.age as c_age, c.gender as c_gender, c."maritalStatus" as "c_maritalStatus",
        c.phone as c_phone, c.email as c_email, c.address as c_address,
        p.id as p_id, p."policyNumber" as "p_policyNumber", p.insurer as p_insurer,
        p.category as p_category, p."subType" as "p_subType", p.status as p_status,
        p."premiumMonthly" as "p_premiumMonthly", p."premiumAnnual" as "p_premiumAnnual",
        p."accumulatedSavings" as "p_accumulatedSavings", p."startDate" as "p_startDate",
        p."endDate" as "p_endDate", p."vehicleYear" as "p_vehicleYear",
        p."vehiclePlate" as "p_vehiclePlate", p."propertyAddress" as "p_propertyAddress"
      FROM customers c
      LEFT JOIN policies p ON p."customerId" = c.id
      ORDER BY c."createdAt" ASC
      WHERE c.id IN (SELECT id FROM customers ORDER BY "createdAt" ASC OFFSET ${offset} LIMIT ${limit})
    `);

    // Group rows by customer
    const customerMap = new Map<string, { customer: typeof rows[0]; policies: typeof rows }>();
    for (const row of rows) {
      if (!customerMap.has(row.c_id)) {
        customerMap.set(row.c_id, { customer: row, policies: [] });
      }
      if (row.p_id) {
        customerMap.get(row.c_id)!.policies.push(row);
      }
    }

    // Get unique customer IDs (respect the limit)
    const allCustomerIds = Array.from(customerMap.keys());
    const customerIds = allCustomerIds.slice(0, limit);

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

    for (const custId of customerIds) {
      const entry = customerMap.get(custId)!;
      const profile = buildProfileFromRawRows(entry.customer, entry.policies);

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
        processed: customerIds.length,
        insightsCreated,
        totalCustomers,
        rulesEvaluated: activeRules.length,
      },
    });

    return NextResponse.json({
      processed: customerIds.length,
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildProfileFromRawRows(customerRow: any, policyRows: any[]): CustomerProfile {
  // Build a customer object from raw SQL columns
  const customer = {
    id: customerRow.c_id,
    firstName: customerRow.c_firstName,
    lastName: customerRow.c_lastName,
    age: customerRow.c_age,
    gender: customerRow.c_gender,
    maritalStatus: customerRow.c_maritalStatus,
    phone: customerRow.c_phone,
    email: customerRow.c_email,
    address: customerRow.c_address,
    policies: [] as unknown[],
  };

  // Build policy objects from raw rows
  const policies = policyRows.map((r) => ({
    id: r.p_id,
    policyNumber: r.p_policyNumber,
    insurer: r.p_insurer,
    category: r.p_category,
    subType: r.p_subType,
    status: r.p_status,
    premiumMonthly: r.p_premiumMonthly ? Number(r.p_premiumMonthly) : null,
    premiumAnnual: r.p_premiumAnnual ? Number(r.p_premiumAnnual) : null,
    accumulatedSavings: r.p_accumulatedSavings ? Number(r.p_accumulatedSavings) : null,
    startDate: r.p_startDate,
    endDate: r.p_endDate,
    vehicleYear: r.p_vehicleYear,
    vehiclePlate: r.p_vehiclePlate,
    propertyAddress: r.p_propertyAddress,
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
