/**
 * Build the human-readable "why today" Hebrew reason for a queue entry,
 * determine its ReasonCategory, and flag time-critical items.
 *
 * Thresholds (age milestones, high-value, management fees, etc.) are
 * supplied via a QueueSettings argument so רפי can tune them from the
 * Queue Settings page without code changes.
 */

import type { ReasonCategory } from "@prisma/client";
import type { QueueSettings } from "./settings";

export interface ReasonInsight {
  id: string;
  category: string;
  title: string;
  strengthScore: number | null;
  urgencyLevel: number;
  linkedRuleId: string | null;
}

export interface ReasonCustomer {
  id: string;
  age: number | null;
  dateOfBirth: Date | null;
  lastReviewDate: Date | null;
  /** True if the customer has at least one ACTIVE PENSION policy. */
  hasPensionPolicy: boolean;
  /** Sum of accumulatedSavings across active policies. */
  totalSavings: number;
}

export interface ReasonPolicy {
  id: string;
  category: string;
  status: string;
  endDate: Date | null;
  premiumMonthly: number | null;
  premiumAnnual: number | null;
  accumulatedSavings: number | null;
  managementFeePercent: number | null;
}

export interface ReasonContext {
  insight: ReasonInsight;
  customer: ReasonCustomer;
  policies: ReasonPolicy[];
  lastContactAt: Date | null;
  totalMonthlyPremium: number;
  totalAccumulatedSavings: number;
  activeCategoryCount: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * DAY_MS;
const TWELVE_MONTHS_MS = 365 * DAY_MS;

function formatIlsWhole(n: number): string {
  return `₪${Math.round(n).toLocaleString("he-IL")}`;
}

function nearestExpiringActivePolicy(policies: ReasonPolicy[]): ReasonPolicy | null {
  const now = Date.now();
  const cutoff = now + THIRTY_DAYS_MS;
  let best: ReasonPolicy | null = null;
  for (const p of policies) {
    if (p.status !== "ACTIVE") continue;
    if (!p.endDate) continue;
    const t = p.endDate.getTime();
    if (t < now) continue;
    if (t > cutoff) continue;
    if (!best || (best.endDate && p.endDate < best.endDate)) best = p;
  }
  return best;
}

function recentMilestoneAge(
  customer: ReasonCustomer,
  settings: QueueSettings
): number | null {
  if (!customer.dateOfBirth) return null;
  if (settings.ageMilestones.length === 0) return null;

  // Business rule: only trigger if the customer has something meaningful
  // for us to talk about at the milestone. Pension OR significant savings.
  if (settings.milestoneRequiresPensionOrSavings) {
    const qualifies =
      customer.hasPensionPolicy ||
      customer.totalSavings >= settings.milestoneMinSavings;
    if (!qualifies) return null;
  }

  const now = Date.now();
  const windowMs = settings.milestoneFreshnessDays * DAY_MS;
  for (const age of settings.ageMilestones) {
    const bday = new Date(customer.dateOfBirth);
    const milestoneDate = new Date(bday);
    milestoneDate.setFullYear(bday.getFullYear() + age);
    const diff = now - milestoneDate.getTime();
    if (diff >= 0 && diff <= windowMs) return age;
  }
  return null;
}

function hasCategory(policies: ReasonPolicy[], category: string): boolean {
  return policies.some((p) => p.category === category && p.status === "ACTIVE");
}

function worstManagementFeePolicy(
  policies: ReasonPolicy[],
  settings: QueueSettings
): ReasonPolicy | null {
  let best: ReasonPolicy | null = null;
  for (const p of policies) {
    if (p.status !== "ACTIVE") continue;
    if (p.managementFeePercent == null) continue;
    if (p.managementFeePercent <= settings.managementFeeThreshold) continue;
    if ((p.accumulatedSavings ?? 0) <= settings.costOptimizationMinSavings) continue;
    if (!best || p.managementFeePercent > (best.managementFeePercent ?? 0)) {
      best = p;
    }
  }
  return best;
}

export function determineReasonCategory(
  ctx: ReasonContext,
  settings: QueueSettings
): ReasonCategory {
  // Priority order: our unique value FIRST, renewal LAST.
  // BAFI already handles renewals, so URGENT_EXPIRY is the fallback —
  // only picked if the customer has no other story to tell.
  if (recentMilestoneAge(ctx.customer, settings) != null) return "AGE_MILESTONE";
  if (
    ctx.totalAccumulatedSavings > settings.highValueSavingsThreshold ||
    ctx.totalMonthlyPremium > settings.highValueMonthlyPremiumThreshold
  ) {
    return "HIGH_VALUE";
  }
  if (worstManagementFeePolicy(ctx.policies, settings)) return "COST_OPTIMIZATION";
  if (!hasCategory(ctx.policies, "HEALTH") || !hasCategory(ctx.policies, "LIFE")) {
    return "COVERAGE_GAP";
  }
  if (
    ctx.lastContactAt &&
    Date.now() - ctx.lastContactAt.getTime() > TWELVE_MONTHS_MS
  ) {
    return "SERVICE";
  }
  if (!ctx.lastContactAt) return "SERVICE";
  if (ctx.activeCategoryCount === 1) return "CROSS_SELL";
  // URGENT_EXPIRY is intentionally not returned here any more — renewals
  // live in the BAFI lane (/renewals) and do not compete with the AI queue.
  return "CROSS_SELL";
}

export function buildWhyTodayReason(
  ctx: ReasonContext,
  settings: QueueSettings
): string {
  const milestone = recentMilestoneAge(ctx.customer, settings);
  if (milestone != null) {
    return `הלקוח הגיע לגיל ${milestone} לאחרונה`;
  }

  if (
    ctx.totalAccumulatedSavings > settings.highValueSavingsThreshold ||
    ctx.totalMonthlyPremium > settings.highValueMonthlyPremiumThreshold
  ) {
    const valueBasis =
      ctx.totalAccumulatedSavings > settings.highValueSavingsThreshold
        ? ctx.totalAccumulatedSavings
        : ctx.totalMonthlyPremium * 12;
    return `לקוח בעל ערך גבוה (${formatIlsWhole(valueBasis)})`;
  }

  const feePolicy = worstManagementFeePolicy(ctx.policies, settings);
  if (feePolicy && feePolicy.accumulatedSavings != null) {
    return `דמי ניהול חריגים על חיסכון של ${formatIlsWhole(
      feePolicy.accumulatedSavings
    )}`;
  }

  if (!hasCategory(ctx.policies, "HEALTH")) return "חסר כיסוי בריאות";
  if (!hasCategory(ctx.policies, "LIFE")) return "חסר כיסוי חיים";

  if (
    !ctx.lastContactAt ||
    Date.now() - ctx.lastContactAt.getTime() > TWELVE_MONTHS_MS
  ) {
    return "לא היה קשר בשנה האחרונה";
  }

  if (ctx.activeCategoryCount === 1) {
    return "ללקוח קטגוריית ביטוח אחת בלבד";
  }

  const expiring = nearestExpiringActivePolicy(ctx.policies);
  if (expiring && expiring.endDate) {
    const days = Math.max(
      0,
      Math.ceil((expiring.endDate.getTime() - Date.now()) / DAY_MS)
    );
    return `פוליסה מסתיימת בעוד ${days} ימים`;
  }

  return ctx.insight.title;
}

// What counts as "urgent enough to get a reserved slot" is configurable
// per office in Queue Settings. Default: only AGE_MILESTONE.
export function isTimeCritical(
  ctx: ReasonContext,
  settings: QueueSettings
): boolean {
  const category = determineReasonCategory(ctx, settings);
  return settings.urgentCategories.includes(category);
}
