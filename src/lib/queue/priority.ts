/**
 * Queue priority score — a single 0-100 number that orders the queue.
 * Internal only now: the card does not display it after Stage 1. We keep
 * computing it because (a) it still drives the sort and (b) Stage 3 may
 * re-surface it in admin/research screens.
 *
 * Formula:
 *   score = bucketFloor + strengthBonus + valueBonus + renewalPenalty
 *   clamp 0..100
 *
 * bucketFloor comes from settings.bucketOrder — the position of this
 * insight's office bucket (רפי's taxonomy). Position 1 = 85, 2 = 68,
 * 3 = 55, 4 = 42. Spaced widely enough that the ±5 strength nudge and
 * 0..+5 value bonus cannot flip a customer out of their bucket band.
 *
 * Strength + value nudge within the band. Renewal penalty (-10) keeps
 * EXPIRING_POLICY insights at the bottom if they ever sneak in.
 */
import type { ReasonContext } from "./reason-builder";
import type { OfficeBucket } from "./buckets";
import type { QueueSettings } from "./settings";

export interface PriorityBreakdown {
  score: number;
  bucket: OfficeBucket;
  bucketFloor: number;
  strengthBonus: number;
  valueBonus: number;
  renewalPenalty: number;
  reasonMatchBonus: number;
}

const RENEWAL_INSIGHT_CATEGORIES = new Set(["EXPIRING_POLICY"]);

/**
 * Ordered floors by bucket position in settings.bucketOrder.
 * Spacing of 13-17 keeps bucket bands well-separated.
 */
const POSITION_FLOORS = [85, 68, 55, 42];

function floorForBucket(
  bucket: OfficeBucket,
  settings: Pick<QueueSettings, "bucketOrder">
): number {
  // Renewals, if they somehow end up as primary, sit below everything.
  if (bucket === "renewal") return 30;
  const idx = settings.bucketOrder.indexOf(
    bucket as "coverage" | "savings" | "service" | "general"
  );
  if (idx < 0 || idx >= POSITION_FLOORS.length) {
    // Unknown bucket — bottom of the pack
    return POSITION_FLOORS[POSITION_FLOORS.length - 1];
  }
  return POSITION_FLOORS[idx];
}

/** Map insight strength (0-100) to ±5 within the band. */
function strengthBonus(strength: number | null): number {
  if (strength == null) return 0;
  const clamped = Math.max(0, Math.min(100, strength));
  return Math.round(((clamped - 50) / 50) * 5);
}

/** Map portfolio value (savings + annualized premium) to 0..+5, log-ish. */
function valueBonus(ctx: ReasonContext): number {
  const annualized = ctx.totalMonthlyPremium * 12;
  const total = ctx.totalAccumulatedSavings + annualized;
  if (total <= 100_000) return 0;
  if (total >= 3_000_000) return 5;
  const t = Math.log10(total / 100_000) / Math.log10(30);
  return Math.round(t * 5);
}

export function computePriority(
  ctx: ReasonContext,
  bucket: OfficeBucket,
  reasonBucket: OfficeBucket | null,
  settings: Pick<QueueSettings, "bucketOrder">
): PriorityBreakdown {
  // The floor comes from the CUSTOMER's reason bucket — shared by all of
  // that customer's insights — so bucket order ranks customers against
  // each other, not insights within a single customer. This keeps a
  // wealthy customer with a coverage insight in the חיסכון band, and
  // prevents the highest-floor insight from always winning primary just
  // because its own topic happens to land in position 1 of bucketOrder.
  const floorBucket: OfficeBucket = reasonBucket ?? bucket;
  const floor = floorForBucket(floorBucket, settings);
  const strength = strengthBonus(ctx.insight.strengthScore);
  const value = valueBonus(ctx);
  const penalty = RENEWAL_INSIGHT_CATEGORIES.has(ctx.insight.category)
    ? -10
    : 0;
  // The headline insight should MATCH the customer's reason bucket.
  // Age-60 customer (reason=service) → prefers תכנון פרישה (service)
  // over ביטוח נסיעות (coverage) even if travel has higher strength.
  const reasonMatch =
    reasonBucket != null && reasonBucket === bucket ? 8 : 0;

  const raw = floor + strength + value + penalty + reasonMatch;
  const score = Math.max(0, Math.min(100, raw));

  return {
    score,
    bucket: floorBucket,
    bucketFloor: floor,
    strengthBonus: strength,
    valueBonus: value,
    renewalPenalty: penalty,
    reasonMatchBonus: reasonMatch,
  };
}
