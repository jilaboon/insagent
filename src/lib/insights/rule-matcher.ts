/**
 * Dynamic Rule Matcher
 *
 * Parses triggerCondition strings from OfficeRule records
 * and evaluates them against a CustomerProfile.
 *
 * Supported condition patterns:
 *   age >= 60, age < 50
 *   policy_category = LIFE                   — per-policy
 *   no_policy_category = HEALTH              — customer-wide
 *   policy_subtype = רכב                     — per-policy
 *   policy_age_years > 3                     — per-policy
 *   vehicle_age <= 2                         — per-policy
 *   premium_monthly >= 100                   — per-policy
 *   premium_annual >= 1200                   — per-policy
 *   policy_count = 1, policy_count >= 2      — customer-wide
 *   category_count = 1                       — customer-wide
 *   property_policy_count >= 2               — customer-wide (any PROPERTY)
 *   home_policy_count >= 2                   — customer-wide (דירה/מבנה only)
 *   car_policy_count >= 1                    — customer-wide (רכב only)
 *   has_expiring_policy                      — customer-wide
 *   savings > 100000                         — customer-wide
 *   management_fee > 1.5                     — customer-wide
 *   months_since_review > 18                 — customer-wide (null → ∞)
 *   customer_tenure_years > 3                — customer-wide
 *       (oldest startDate across ALL policies — including cancelled
 *        and expired — so renewals don't reset tenure)
 *   has_life_and_elementary                  — customer-wide
 *   travel_season                            — customer-wide
 *   external_policy_expiring_within_days < 90 — customer-wide
 *       (matches when the customer has ≥1 Policy with
 *        externalSource = HAR_HABITUACH and endDate within N days
 *        from now; already-expired policies are excluded)
 *   always
 *   AND combinations
 *
 * Semantics for AND:
 *   - Per-policy clauses (policy_*, vehicle_*, premium_*) are evaluated
 *     JOINTLY: at least one ACTIVE policy must satisfy all of them.
 *   - Customer-wide clauses are independent checks on the customer.
 *   - Both groups must hold for the rule to match.
 *   Example: "policy_category = LIFE AND policy_age_years > 3 AND premium_monthly >= 100"
 *   → fires iff the customer has at least one LIFE policy that is BOTH
 *   older than 3 years AND has a monthly premium of ≥ ₪100.
 */

import type { OfficeRule } from "@prisma/client";
import type { CustomerProfile } from "./rules/types";

const PER_POLICY_FIELDS = new Set([
  "policy_category",
  "policy_subtype",
  "policy_age_years",
  "vehicle_age",
  "premium_monthly",
  "premium_annual",
]);

const CLAUSE_PATTERN = /^(\w+)\s*(>=|<=|!=|>|<|=)\s*(.+)$/;

// ============================================================
// Status buckets
// ------------------------------------------------------------
// CANCELLED / EXPIRED → never count anywhere.
// FROZEN / PAID_UP / ARREARS → "needs attention". For premium /
//   category / count clauses these are inactive (the customer isn't
//   paying premium). For savings + management_fee they DO count —
//   the money is still parked in the account.
// ACTIVE / PROPOSAL / UNKNOWN → fully active. PROPOSAL & UNKNOWN are
//   treated as default-active so we don't drop policies whose status
//   field wasn't populated by the importer.
// ============================================================
const ACTIVE_FOR_PREMIUM = ["ACTIVE", "PROPOSAL", "UNKNOWN"] as const;
const ACTIVE_FOR_SAVINGS = [
  "ACTIVE",
  "PROPOSAL",
  "UNKNOWN",
  "PAID_UP",
] as const;

function isActiveForPremium(p: { status: string }): boolean {
  return (ACTIVE_FOR_PREMIUM as readonly string[]).includes(p.status);
}

function isActiveForSavings(p: { status: string }): boolean {
  return (ACTIVE_FOR_SAVINGS as readonly string[]).includes(p.status);
}

// ============================================================
// Match result
// ------------------------------------------------------------
// Callers can use the `matched` boolean for the binary decision and
// `matchedPolicyIds` for "which policies actually triggered this rule".
// The IDs are deduplicated. For pure customer-wide rules with no
// specific policy contribution (e.g. "age > 60"), the array is empty.
// Per-policy clauses contribute the policies that satisfied them;
// count / sum clauses contribute the policies that were counted /
// summed; absence clauses (no_policy_category) contribute nothing.
// ============================================================
export interface RuleMatchResult {
  matched: boolean;
  matchedPolicyIds: string[];
}

/**
 * Check if a single rule matches a customer profile.
 *
 * Returns a `{ matched, matchedPolicyIds }` object so callers that need
 * the binary decision can read `.matched`, while callers that need to
 * surface the triggering policies (UI, evidence persistence) can read
 * `.matchedPolicyIds`. On any parsing error the result is
 * `{ matched: false, matchedPolicyIds: [] }`.
 */
export function matchRuleToCustomer(
  rule: OfficeRule,
  profile: CustomerProfile
): RuleMatchResult {
  const NO_MATCH: RuleMatchResult = { matched: false, matchedPolicyIds: [] };
  const condition = rule.triggerCondition?.trim();

  // No condition or empty = don't match
  if (!condition) return NO_MATCH;

  // Special: always matches everyone, no specific policies trigger it.
  if (condition === "always") {
    return { matched: true, matchedPolicyIds: [] };
  }

  try {
    const parts = condition.split(/\s+AND\s+/).map((p) => p.trim());

    // Split into per-policy vs customer-wide clauses
    const perPolicyClauses: string[] = [];
    const customerClauses: string[] = [];
    for (const clause of parts) {
      const match = clause.match(CLAUSE_PATTERN);
      if (match && PER_POLICY_FIELDS.has(match[1])) {
        perPolicyClauses.push(clause);
      } else {
        customerClauses.push(clause);
      }
    }

    // Customer-wide: every clause must hold independently. Each
    // evaluator returns the IDs that contributed (count / sum / set
    // membership). If any clause fails we bail out early.
    const customerContribIds: string[] = [];
    for (const clause of customerClauses) {
      const res = evaluateCondition(clause, profile);
      if (!res.matched) return NO_MATCH;
      customerContribIds.push(...res.contributingIds);
    }

    // Per-policy: at least one policy from the premium-active bucket
    // must satisfy ALL per-policy clauses simultaneously. Empty
    // per-policy set ⇒ pass with no contribution.
    const perPolicyContribIds: string[] = [];
    if (perPolicyClauses.length > 0) {
      const perPolicyHits = profile.activePolicies
        .filter(isActiveForPremium)
        .filter((policy) =>
          perPolicyClauses.every((c) =>
            evaluatePolicyCondition(c, policy, profile)
          )
        );
      if (perPolicyHits.length === 0) return NO_MATCH;
      for (const p of perPolicyHits) perPolicyContribIds.push(p.id);
    }

    const dedup = Array.from(
      new Set([...customerContribIds, ...perPolicyContribIds])
    );

    return { matched: true, matchedPolicyIds: dedup };
  } catch {
    // Defensive: bad condition = no match
    return NO_MATCH;
  }
}

// ============================================================
// Internal: evaluate a single condition clause
// ------------------------------------------------------------
// Returns the boolean match plus the IDs of any policies that
// contributed to the truthiness of the clause. For pure customer-level
// signals (age, has_life_and_elementary, travel_season,
// months_since_review) `contributingIds` stays empty — the clause is
// true because of the customer record itself, not specific policies.
// ============================================================

interface ClauseResult {
  matched: boolean;
  contributingIds: string[];
}

const CLAUSE_FAIL: ClauseResult = { matched: false, contributingIds: [] };

// Har HaBituach policies belong to the customer but not to the office.
// Default office rules ignore them — only the explicit external_*
// clauses opt back in. Without this filter, "single elementary product"
// or "tenure with us" rules would count policies that the office never
// sold or renewed.
function isOffice(p: { externalSource?: string | null }): boolean {
  return p.externalSource !== "HAR_HABITUACH";
}

function evaluateCondition(
  clause: string,
  profile: CustomerProfile
): ClauseResult {
  // Pre-filter once per clause invocation. Premium-style filtering
  // drops FROZEN/PAID_UP/ARREARS — those policies aren't billable
  // engagement targets anymore. Savings-style retains PAID_UP because
  // the accumulated money is still parked in the account. Both views
  // exclude Har HaBituach entries; the explicit external clause
  // re-opens them below.
  const premiumPolicies = profile.activePolicies
    .filter(isActiveForPremium)
    .filter(isOffice);
  const savingsPolicies = profile.activePolicies
    .filter(isActiveForSavings)
    .filter(isOffice);

  // Boolean flags (no operator)
  if (clause === "has_expiring_policy") {
    const hits = premiumPolicies.filter((p) => {
      if (!p.endDate) return false;
      const daysLeft =
        (new Date(p.endDate).getTime() - Date.now()) / (24 * 60 * 60 * 1000);
      return daysLeft > 0 && daysLeft <= 90;
    });
    return {
      matched: hits.length > 0,
      contributingIds: hits.map((p) => p.id),
    };
  }

  if (clause === "has_life_and_elementary") {
    return {
      matched: profile.hasLifeBranch && profile.hasElementaryBranch,
      contributingIds: [],
    };
  }

  if (clause === "travel_season") {
    const month = new Date().getMonth();
    return { matched: month >= 3 && month <= 8, contributingIds: [] };
  }

  if (clause === "always") {
    return { matched: true, contributingIds: [] };
  }

  // Pattern: field operator value
  const match = clause.match(
    /^(\w+)\s*(>=|<=|!=|>|<|=)\s*(.+)$/
  );
  if (!match) return CLAUSE_FAIL;

  const [, field, operator, rawValue] = match;
  const value = rawValue.trim();

  switch (field) {
    case "age": {
      const age = profile.customer.age;
      if (age == null) return CLAUSE_FAIL;
      return {
        matched: compareNumber(age, operator, parseFloat(value)),
        contributingIds: [],
      };
    }

    case "policy_category": {
      const hits = premiumPolicies.filter((p) => p.category === value);
      return {
        matched: hits.length > 0,
        contributingIds: hits.map((p) => p.id),
      };
    }

    case "no_policy_category": {
      // Absence clause: true means "the customer has at least one
      // policy AND none of them are of this category". No policies
      // trigger this; it's the gap that matters, so contribIds = [].
      if (premiumPolicies.length === 0) return CLAUSE_FAIL;
      const matched = !premiumPolicies.some((p) => p.category === value);
      return { matched, contributingIds: [] };
    }

    case "policy_subtype": {
      const hits = premiumPolicies.filter(
        (p) =>
          p.subType === value ||
          p.subType?.includes(value) ||
          p.productName?.includes(value)
      );
      return {
        matched: hits.length > 0,
        contributingIds: hits.map((p) => p.id),
      };
    }

    case "policy_age_years": {
      const threshold = parseFloat(value);
      if (isNaN(threshold)) return CLAUSE_FAIL;
      const hits = premiumPolicies.filter((p) => {
        if (!p.startDate) return false;
        const years =
          (Date.now() - new Date(p.startDate).getTime()) /
          (365.25 * 24 * 60 * 60 * 1000);
        return compareNumber(years, operator, threshold);
      });
      return {
        matched: hits.length > 0,
        contributingIds: hits.map((p) => p.id),
      };
    }

    case "vehicle_age": {
      const maxAge = parseFloat(value);
      if (isNaN(maxAge)) return CLAUSE_FAIL;
      const currentYear = new Date().getFullYear();
      const hits = premiumPolicies.filter((p) => {
        if (!p.vehicleYear) return false;
        const vehicleAge = currentYear - p.vehicleYear;
        return compareNumber(vehicleAge, operator, maxAge);
      });
      return {
        matched: hits.length > 0,
        contributingIds: hits.map((p) => p.id),
      };
    }

    case "policy_count": {
      const target = parseFloat(value);
      if (isNaN(target)) return CLAUSE_FAIL;
      const matched = compareNumber(premiumPolicies.length, operator, target);
      return {
        matched,
        contributingIds: matched ? premiumPolicies.map((p) => p.id) : [],
      };
    }

    case "category_count": {
      const target = parseFloat(value);
      if (isNaN(target)) return CLAUSE_FAIL;
      const categories = new Set(premiumPolicies.map((p) => p.category));
      const matched = compareNumber(categories.size, operator, target);
      return {
        matched,
        contributingIds: matched ? premiumPolicies.map((p) => p.id) : [],
      };
    }

    case "property_policy_count": {
      const target = parseFloat(value);
      if (isNaN(target)) return CLAUSE_FAIL;
      const propPolicies = premiumPolicies.filter(
        (p) => p.category === "PROPERTY"
      );
      const matched = compareNumber(propPolicies.length, operator, target);
      return {
        matched,
        contributingIds: matched ? propPolicies.map((p) => p.id) : [],
      };
    }

    case "home_policy_count": {
      // Counts ONLY home-insurance policies (subType mentions דירה / מבנה).
      // Use this for rental-apartment heuristics — property_policy_count
      // is too loose because it also includes car policies, which makes
      // "customer has a rented flat" fire for every normal car+home owner.
      const target = parseFloat(value);
      if (isNaN(target)) return CLAUSE_FAIL;
      const homePolicies = premiumPolicies.filter((p) => {
        if (p.category !== "PROPERTY") return false;
        const sub = (p.subType || "").toLowerCase();
        return sub.includes("דירה") || sub.includes("מבנה");
      });
      const matched = compareNumber(homePolicies.length, operator, target);
      return {
        matched,
        contributingIds: matched ? homePolicies.map((p) => p.id) : [],
      };
    }

    case "car_policy_count": {
      const target = parseFloat(value);
      if (isNaN(target)) return CLAUSE_FAIL;
      const carPolicies = premiumPolicies.filter((p) => {
        if (p.category !== "PROPERTY") return false;
        const sub = (p.subType || "").toLowerCase();
        return sub.includes("רכב");
      });
      const matched = compareNumber(carPolicies.length, operator, target);
      return {
        matched,
        contributingIds: matched ? carPolicies.map((p) => p.id) : [],
      };
    }

    case "savings": {
      // Sums accumulatedSavings across savings-active policies. PAID_UP
      // policies still hold the money so they're included; CANCELLED
      // and EXPIRED never are. The profile's pre-computed
      // totalAccumulatedSavings is built from the upstream activePolicies
      // bucket which excludes CANCELLED/EXPIRED — but to enforce the
      // savings-bucket rule independently we recompute here.
      const threshold = parseFloat(value);
      if (isNaN(threshold)) return CLAUSE_FAIL;
      const contributing = savingsPolicies.filter(
        (p) => (p.accumulatedSavings ?? 0) > 0
      );
      const total = contributing.reduce(
        (sum, p) => sum + (p.accumulatedSavings ?? 0),
        0
      );
      const matched = compareNumber(total, operator, threshold);
      return {
        matched,
        contributingIds: matched ? contributing.map((p) => p.id) : [],
      };
    }

    case "management_fee": {
      // Compares the higher of the two fee fields on each policy.
      // PAID_UP policies still incur fees on the accumulated balance,
      // so they remain in scope. Contributing IDs are the specific
      // policies whose own fee crosses the threshold.
      const threshold = parseFloat(value);
      if (isNaN(threshold)) return CLAUSE_FAIL;
      let maxFee: number | null = null;
      const contributing: string[] = [];
      for (const p of savingsPolicies) {
        const candidates = [p.feeOnAccumulationPct, p.feeOnPremiumPct]
          .filter((x): x is number => x != null);
        if (candidates.length === 0) continue;
        const policyMax = Math.max(...candidates);
        if (maxFee == null || policyMax > maxFee) maxFee = policyMax;
        if (compareNumber(policyMax, operator, threshold)) {
          contributing.push(p.id);
        }
      }
      if (maxFee == null) return CLAUSE_FAIL;
      const matched = compareNumber(maxFee, operator, threshold);
      return {
        matched,
        contributingIds: matched ? contributing : [],
      };
    }

    case "customer_tenure_years": {
      // How long the customer has been with the OFFICE, computed from
      // the oldest policy startDate across all OFFICE policies —
      // including CANCELLED and EXPIRED. Renewals create fresh policy
      // records, so looking only at active policies would miss
      // long-tenured customers whose current policy started recently.
      // Har HaBituach policies are excluded — they're not the office's
      // history with the customer. No specific policies "contribute"
      // — this is a pure customer-level signal.
      const threshold = parseFloat(value);
      if (isNaN(threshold)) return CLAUSE_FAIL;
      let oldest: Date | null = null;
      for (const p of profile.customer.policies) {
        if (!isOffice(p)) continue;
        if (!p.startDate) continue;
        const d = new Date(p.startDate);
        if (!oldest || d < oldest) oldest = d;
      }
      if (!oldest) return CLAUSE_FAIL;
      const years =
        (Date.now() - oldest.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
      return {
        matched: compareNumber(years, operator, threshold),
        contributingIds: [],
      };
    }

    case "months_since_review": {
      // Null lastReviewDate = treat as "never reviewed" = infinity.
      // Lets us write "months_since_review > 18" as "never or > 18mo ago".
      const threshold = parseFloat(value);
      if (isNaN(threshold)) return CLAUSE_FAIL;
      const last = profile.customer.lastReviewDate;
      if (!last) {
        return {
          matched: compareNumber(
            Number.POSITIVE_INFINITY,
            operator,
            threshold
          ),
          contributingIds: [],
        };
      }
      const months =
        (Date.now() - new Date(last).getTime()) /
        (30.44 * 24 * 60 * 60 * 1000);
      return {
        matched: compareNumber(months, operator, threshold),
        contributingIds: [],
      };
    }

    case "external_policy_expiring_within_days": {
      // Matches when the customer has at least one Policy sourced from
      // Har HaBituach whose endDate sits in the window (0, N] days from
      // now. Already-expired policies (diff < 0) don't count — Rafi's
      // "golden window" concept is strictly forward-looking.
      // This is the one clause that explicitly opts INTO Har HaBituach
      // — the default office filter is bypassed here.
      const threshold = parseFloat(value);
      if (isNaN(threshold)) return CLAUSE_FAIL;
      const now = Date.now();
      const externalActive = profile.activePolicies
        .filter(isActiveForPremium)
        .filter(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (p) => (p as any).externalSource === "HAR_HABITUACH"
        );
      const hits = externalActive.filter((p) => {
        if (!p.endDate) return false;
        const daysLeft =
          (new Date(p.endDate).getTime() - now) / (24 * 60 * 60 * 1000);
        if (daysLeft <= 0) return false;
        return compareNumber(daysLeft, operator, threshold);
      });
      return {
        matched: hits.length > 0,
        contributingIds: hits.map((p) => p.id),
      };
    }

    default:
      // Unknown field = no match
      return CLAUSE_FAIL;
  }
}

// ============================================================
// Per-policy evaluation — matches all clauses against a SINGLE policy
// ============================================================

type PolicyLike = CustomerProfile["activePolicies"][number];

function evaluatePolicyCondition(
  clause: string,
  policy: PolicyLike,
  _profile: CustomerProfile
): boolean {
  const match = clause.match(CLAUSE_PATTERN);
  if (!match) return false;
  const [, field, operator, rawValue] = match;
  const value = rawValue.trim();

  switch (field) {
    case "policy_category":
      return policy.category === value;

    case "policy_subtype":
      return (
        policy.subType === value ||
        !!policy.subType?.includes(value) ||
        !!policy.productName?.includes(value)
      );

    case "policy_age_years": {
      const threshold = parseFloat(value);
      if (isNaN(threshold) || !policy.startDate) return false;
      const years =
        (Date.now() - new Date(policy.startDate).getTime()) /
        (365.25 * 24 * 60 * 60 * 1000);
      return compareNumber(years, operator, threshold);
    }

    case "vehicle_age": {
      const maxAge = parseFloat(value);
      if (isNaN(maxAge) || !policy.vehicleYear) return false;
      const currentYear = new Date().getFullYear();
      const vehicleAge = currentYear - policy.vehicleYear;
      return compareNumber(vehicleAge, operator, maxAge);
    }

    case "premium_monthly": {
      const threshold = parseFloat(value);
      if (isNaN(threshold)) return false;
      const monthly =
        policy.premiumMonthly ??
        (policy.premiumAnnual != null ? policy.premiumAnnual / 12 : null);
      if (monthly == null) return false;
      return compareNumber(monthly, operator, threshold);
    }

    case "premium_annual": {
      const threshold = parseFloat(value);
      if (isNaN(threshold)) return false;
      const annual =
        policy.premiumAnnual ??
        (policy.premiumMonthly != null ? policy.premiumMonthly * 12 : null);
      if (annual == null) return false;
      return compareNumber(annual, operator, threshold);
    }

    default:
      return false;
  }
}

// ============================================================
// Numeric comparison helper
// ============================================================

function compareNumber(
  actual: number,
  operator: string,
  expected: number
): boolean {
  if (isNaN(actual) || isNaN(expected)) return false;
  switch (operator) {
    case ">=":
      return actual >= expected;
    case "<=":
      return actual <= expected;
    case ">":
      return actual > expected;
    case "<":
      return actual < expected;
    case "=":
      return actual === expected;
    case "!=":
      return actual !== expected;
    default:
      return false;
  }
}
