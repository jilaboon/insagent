/**
 * Queue priority score — a single 0-100 number that matches the displayed
 * order in the queue. Replaces the raw insight strengthScore for sorting
 * AND for the gauge shown on each card, so rank and gauge can't disagree.
 *
 * Formula:
 *   score = categoryFloor + strengthBonus + valueBonus + renewalPenalty
 *   clamp 0..100
 *
 * Category floor sets the band (AGE_MILESTONE 85, HIGH_VALUE 65, …).
 * Strength + value nudge up to ±5 each within the band.
 * Renewal penalty (-10) demotes EXPIRING_POLICY insights since BAFI already
 * surfaces them — we want our *unique* insights to be the hero.
 */
import type { ReasonCategory } from "@prisma/client";
import type { ReasonContext } from "./reason-builder";

export interface PriorityBreakdown {
  score: number;
  categoryFloor: number;
  categoryLabel: ReasonCategory;
  strengthBonus: number;
  valueBonus: number;
  renewalPenalty: number;
}

const RENEWAL_INSIGHT_CATEGORIES = new Set(["EXPIRING_POLICY"]);

function categoryFloor(cat: ReasonCategory): number {
  switch (cat) {
    case "URGENT_EXPIRY":
      return 95;
    case "AGE_MILESTONE":
      return 85;
    case "HIGH_VALUE":
      return 65;
    case "COST_OPTIMIZATION":
      return 55;
    case "COVERAGE_GAP":
      return 50;
    case "CROSS_SELL":
      return 35;
    case "SERVICE":
      return 25;
    default:
      return 20;
  }
}

/** Map insight strength (0-100) to ±5. */
function strengthBonus(strength: number | null): number {
  if (strength == null) return 0;
  const clamped = Math.max(0, Math.min(100, strength));
  // 50 = neutral, 100 = +5, 0 = -5
  return Math.round(((clamped - 50) / 50) * 5);
}

/** Map portfolio value (savings + annualized premium) to 0..+5, log-ish. */
function valueBonus(ctx: ReasonContext): number {
  const annualized = ctx.totalMonthlyPremium * 12;
  const total = ctx.totalAccumulatedSavings + annualized;
  if (total <= 100_000) return 0;
  if (total >= 3_000_000) return 5;
  // Log scale between 100k and 3M
  const t = Math.log10(total / 100_000) / Math.log10(30); // 0..1 over [100k, 3M]
  return Math.round(t * 5);
}

export function computePriority(
  ctx: ReasonContext,
  category: ReasonCategory
): PriorityBreakdown {
  const floor = categoryFloor(category);
  const strength = strengthBonus(ctx.insight.strengthScore);
  const value = valueBonus(ctx);
  const penalty = RENEWAL_INSIGHT_CATEGORIES.has(ctx.insight.category)
    ? -10
    : 0;

  const raw = floor + strength + value + penalty;
  const score = Math.max(0, Math.min(100, raw));

  return {
    score,
    categoryFloor: floor,
    categoryLabel: category,
    strengthBonus: strength,
    valueBonus: value,
    renewalPenalty: penalty,
  };
}
