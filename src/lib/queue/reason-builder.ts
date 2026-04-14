/**
 * Build the human-readable "why today" Hebrew reason for a queue entry,
 * determine its ReasonCategory, and flag time-critical items.
 */

import type { ReasonCategory } from "@prisma/client";

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

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const TWELVE_MONTHS_MS = 365 * 24 * 60 * 60 * 1000;

const MILESTONE_AGES = [60, 65, 67];
const HIGH_VALUE_SAVINGS_THRESHOLD = 500_000;
const HIGH_VALUE_PREMIUM_THRESHOLD = 1_500;
const MGMT_FEE_THRESHOLD = 1.5;
const COST_OPT_SAVINGS_THRESHOLD = 100_000;

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

function recentMilestoneAge(customer: ReasonCustomer): number | null {
  if (!customer.dateOfBirth) return null;
  const now = Date.now();
  for (const age of MILESTONE_AGES) {
    const bday = new Date(customer.dateOfBirth);
    const milestoneDate = new Date(bday);
    milestoneDate.setFullYear(bday.getFullYear() + age);
    const diff = now - milestoneDate.getTime();
    if (diff >= 0 && diff <= NINETY_DAYS_MS) return age;
  }
  return null;
}

function hasCategory(policies: ReasonPolicy[], category: string): boolean {
  return policies.some((p) => p.category === category && p.status === "ACTIVE");
}

function worstManagementFeePolicy(policies: ReasonPolicy[]): ReasonPolicy | null {
  let best: ReasonPolicy | null = null;
  for (const p of policies) {
    if (p.status !== "ACTIVE") continue;
    if (p.managementFeePercent == null) continue;
    if (p.managementFeePercent <= MGMT_FEE_THRESHOLD) continue;
    if ((p.accumulatedSavings ?? 0) <= COST_OPT_SAVINGS_THRESHOLD) continue;
    if (!best || p.managementFeePercent > (best.managementFeePercent ?? 0)) {
      best = p;
    }
  }
  return best;
}

export function determineReasonCategory(ctx: ReasonContext): ReasonCategory {
  // Priority order: our unique value FIRST, renewal LAST.
  // BAFI already handles renewals, so URGENT_EXPIRY is the fallback —
  // only picked if the customer has no other story to tell.
  if (recentMilestoneAge(ctx.customer) != null) return "AGE_MILESTONE";
  if (
    ctx.totalAccumulatedSavings > HIGH_VALUE_SAVINGS_THRESHOLD ||
    ctx.totalMonthlyPremium > HIGH_VALUE_PREMIUM_THRESHOLD
  ) {
    return "HIGH_VALUE";
  }
  if (worstManagementFeePolicy(ctx.policies)) return "COST_OPTIMIZATION";
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
  // Last resort — if nothing else stands out but there's an expiring policy
  if (nearestExpiringActivePolicy(ctx.policies)) return "URGENT_EXPIRY";
  return "CROSS_SELL";
}

export function buildWhyTodayReason(ctx: ReasonContext): string {
  const expiring = nearestExpiringActivePolicy(ctx.policies);
  if (expiring && expiring.endDate) {
    const days = Math.max(
      0,
      Math.ceil(
        (expiring.endDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000)
      )
    );
    return `פוליסה מסתיימת בעוד ${days} ימים`;
  }

  const milestone = recentMilestoneAge(ctx.customer);
  if (milestone != null) {
    return `הלקוח הגיע לגיל ${milestone} לאחרונה`;
  }

  if (
    ctx.totalAccumulatedSavings > HIGH_VALUE_SAVINGS_THRESHOLD ||
    ctx.totalMonthlyPremium > HIGH_VALUE_PREMIUM_THRESHOLD
  ) {
    const valueBasis =
      ctx.totalAccumulatedSavings > HIGH_VALUE_SAVINGS_THRESHOLD
        ? ctx.totalAccumulatedSavings
        : ctx.totalMonthlyPremium * 12;
    return `לקוח בעל ערך גבוה (${formatIlsWhole(valueBasis)})`;
  }

  const feePolicy = worstManagementFeePolicy(ctx.policies);
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

  return ctx.insight.title;
}

// Policy: BAFI already handles renewals. We de-prioritize them so we don't
// compete with BAFI on its own turf. Renewals can still appear in the queue
// if they pass gates + score high, but they don't claim urgent reserve slots
// and they don't bypass the "recently contacted" suppression.
export function isTimeCritical(ctx: ReasonContext): boolean {
  const category = determineReasonCategory(ctx);
  // AGE_MILESTONE is time-critical (life event). URGENT_EXPIRY is NOT —
  // BAFI handles renewals, our value is in the other reason categories.
  return category === "AGE_MILESTONE";
}
