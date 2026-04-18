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
