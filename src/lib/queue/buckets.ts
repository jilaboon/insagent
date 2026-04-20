/**
 * Office buckets — the only visible taxonomy the agent sees.
 *
 * Source of truth: OfficeRule.category, authored by רפי in his own language.
 * Four visible buckets: כיסוי / חיסכון / שירות / כללי.
 * A fifth — חידוש — exists but never appears in the main queue (BAFI lane).
 *
 * When an insight has no linked rule (AI-generated, etc.) we fall back to
 * mapping the engineering-side InsightCategory enum. This keeps the card
 * working while the rule catalog fills in.
 */

export type OfficeBucket = "coverage" | "savings" | "service" | "general" | "renewal";

export const OFFICE_BUCKET_LABELS: Record<OfficeBucket, string> = {
  coverage: "כיסוי",
  savings: "חיסכון",
  service: "שירות",
  general: "כללי",
  renewal: "חידוש",
};

/**
 * Map an OfficeRule.category Hebrew string to our internal bucket key.
 * רפי's seed rules use these exact words; accept the English forms too
 * for robustness.
 */
export function ruleCategoryToBucket(ruleCategory: string | null | undefined): OfficeBucket | null {
  if (!ruleCategory) return null;
  const c = ruleCategory.trim().toLowerCase();
  if (c === "כיסוי" || c === "coverage") return "coverage";
  if (c === "חיסכון" || c === "savings") return "savings";
  if (c === "שירות" || c === "service") return "service";
  if (c === "כללי" || c === "general") return "general";
  if (c === "חידוש" || c === "renewal") return "renewal";
  return null;
}

/**
 * Fallback map from engineering InsightCategory → office bucket.
 * Used only when no linked rule exists. Keep narrow and explicit —
 * every addition is a product decision.
 */
export function insightCategoryToBucket(category: string | null | undefined): OfficeBucket {
  switch (category) {
    case "EXPIRING_POLICY":
      return "renewal";
    case "NO_HEALTH":
    case "NO_PROPERTY":
    case "COVERAGE_GAP":
    case "FAMILY_NO_COVERAGE":
    case "HIGH_SAVINGS_LOW_PROTECTION":
      return "coverage";
    case "MANAGEMENT_FEE_HIGH":
    case "DEPOSIT_GAP":
      return "savings";
    case "AGE_MILESTONE":
    case "NO_RECENT_CONTACT":
    case "POLICY_AGE_REVIEW":
    case "STALE_DATA":
      return "service";
    case "SINGLE_CATEGORY":
    case "CROSS_SELL_OPPORTUNITY":
    case "PREMIUM_CONCENTRATION":
    case "AI_GENERATED":
    default:
      return "general";
  }
}

/** Choose the bucket for an insight: prefer the linked rule, fall back to mapping. */
export function resolveBucket(
  ruleCategory: string | null | undefined,
  insightCategory: string | null | undefined
): OfficeBucket {
  return ruleCategoryToBucket(ruleCategory) ?? insightCategoryToBucket(insightCategory);
}

/**
 * Rules that fire for broad populations and carry only generic advice —
 * not personalized to the customer's data. They're useful as "conversation
 * topics" but should never headline a card as the primary insight when
 * something more specific is available. Identified by trigger conditions
 * that match most customers (any car, any home, policy_count ≥ 2, or
 * season-based) without narrowing by age/policy-age/amount.
 *
 * Detection is a substring match on the rule title. It's not pretty, but
 * it avoids a schema change and works against רפי's current seed catalog.
 */
const GENERIC_TIP_TITLE_PATTERNS: string[] = [
  "ביטוח נסיעות",
  "אל תחכו עם ביטוח נסיעות",
  "מוסכי הסדר",
  "קרתה תאונה",
  "שיפוץ",
  "משפצים",
];

export function isGenericTipRule(ruleTitle: string | null | undefined): boolean {
  if (!ruleTitle) return false;
  const title = ruleTitle.trim();
  return GENERIC_TIP_TITLE_PATTERNS.some((pattern) => title.includes(pattern));
}

/**
 * Map a queue entry's ReasonCategory (customer-level signal) to a bucket.
 * The tag on the card answers "why THIS customer today?" — not "what's the
 * topic of the insight?". Customer context usually beats insight topic:
 * a wealthy client with a coverage gap is still a חיסכון conversation,
 * a 60-year-old with a missing property policy is still a שירות call.
 */
export function reasonCategoryToBucket(
  reasonCategory: string | null | undefined
): OfficeBucket | null {
  switch (reasonCategory) {
    case "AGE_MILESTONE":
      return "service";
    case "HIGH_VALUE":
      return "savings";
    case "COST_OPTIMIZATION":
      return "savings";
    case "COVERAGE_GAP":
      return "coverage";
    case "SERVICE":
      return "service";
    case "CROSS_SELL":
      return "general";
    case "URGENT_EXPIRY":
      return "renewal";
    default:
      return null;
  }
}

/**
 * Card-level bucket resolver. Prefers the customer-level reason category
 * (diversifies the dashboard: age customers → שירות, wealthy → חיסכון,
 * etc.) and falls back to the insight-level topic only when no clear
 * customer signal exists.
 */
export function resolveCardBucket(
  reasonCategory: string | null | undefined,
  ruleCategory: string | null | undefined,
  insightCategory: string | null | undefined
): OfficeBucket {
  return (
    reasonCategoryToBucket(reasonCategory) ??
    ruleCategoryToBucket(ruleCategory) ??
    insightCategoryToBucket(insightCategory)
  );
}
