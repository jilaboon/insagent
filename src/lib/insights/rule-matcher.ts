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

/**
 * Check if a single rule matches a customer profile.
 * Returns false on any parsing error (defensive).
 */
export function matchRuleToCustomer(
  rule: OfficeRule,
  profile: CustomerProfile
): boolean {
  const condition = rule.triggerCondition?.trim();

  // No condition or empty = don't match
  if (!condition) return false;

  // Special: always matches everyone
  if (condition === "always") return true;

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

    // Customer-wide: every clause must hold independently.
    const customerOk = customerClauses.every((c) =>
      evaluateCondition(c, profile)
    );
    if (!customerOk) return false;

    // Per-policy: at least one ACTIVE policy must satisfy ALL
    // per-policy clauses simultaneously. Empty per-policy set = pass.
    if (perPolicyClauses.length === 0) return true;
    return profile.activePolicies.some((policy) =>
      perPolicyClauses.every((c) =>
        evaluatePolicyCondition(c, policy, profile)
      )
    );
  } catch {
    // Defensive: bad condition = no match
    return false;
  }
}

// ============================================================
// Internal: evaluate a single condition clause
// ============================================================

function evaluateCondition(
  clause: string,
  profile: CustomerProfile
): boolean {
  // Boolean flags (no operator)
  if (clause === "has_expiring_policy") {
    return profile.activePolicies.some((p) => {
      if (!p.endDate) return false;
      const daysLeft =
        (new Date(p.endDate).getTime() - Date.now()) / (24 * 60 * 60 * 1000);
      return daysLeft > 0 && daysLeft <= 90;
    });
  }

  if (clause === "has_life_and_elementary") {
    return profile.hasLifeBranch && profile.hasElementaryBranch;
  }

  if (clause === "travel_season") {
    const month = new Date().getMonth();
    return month >= 3 && month <= 8; // March-August
  }

  if (clause === "always") {
    return true;
  }

  // Pattern: field operator value
  const match = clause.match(
    /^(\w+)\s*(>=|<=|!=|>|<|=)\s*(.+)$/
  );
  if (!match) return false;

  const [, field, operator, rawValue] = match;
  const value = rawValue.trim();

  switch (field) {
    case "age": {
      const age = profile.customer.age;
      if (age == null) return false;
      return compareNumber(age, operator, parseFloat(value));
    }

    case "policy_category": {
      return profile.activePolicies.some((p) => p.category === value);
    }

    case "no_policy_category": {
      if (profile.activePolicies.length === 0) return false;
      return !profile.activePolicies.some((p) => p.category === value);
    }

    case "policy_subtype": {
      return profile.activePolicies.some(
        (p) =>
          p.subType === value ||
          p.subType?.includes(value) ||
          p.productName?.includes(value)
      );
    }

    case "policy_age_years": {
      const threshold = parseFloat(value);
      if (isNaN(threshold)) return false;
      return profile.activePolicies.some((p) => {
        if (!p.startDate) return false;
        const years =
          (Date.now() - new Date(p.startDate).getTime()) /
          (365.25 * 24 * 60 * 60 * 1000);
        return compareNumber(years, operator, threshold);
      });
    }

    case "vehicle_age": {
      const maxAge = parseFloat(value);
      if (isNaN(maxAge)) return false;
      const currentYear = new Date().getFullYear();
      return profile.activePolicies.some((p) => {
        if (!p.vehicleYear) return false;
        const vehicleAge = currentYear - p.vehicleYear;
        return compareNumber(vehicleAge, operator, maxAge);
      });
    }

    case "policy_count": {
      const target = parseFloat(value);
      if (isNaN(target)) return false;
      return compareNumber(profile.activePolicies.length, operator, target);
    }

    case "category_count": {
      const target = parseFloat(value);
      if (isNaN(target)) return false;
      const categories = new Set(profile.activePolicies.map((p) => p.category));
      return compareNumber(categories.size, operator, target);
    }

    case "property_policy_count": {
      const target = parseFloat(value);
      if (isNaN(target)) return false;
      const propCount = profile.activePolicies.filter(
        (p) => p.category === "PROPERTY"
      ).length;
      return compareNumber(propCount, operator, target);
    }

    case "home_policy_count": {
      // Counts ONLY home-insurance policies (subType mentions דירה / מבנה).
      // Use this for rental-apartment heuristics — property_policy_count
      // is too loose because it also includes car policies, which makes
      // "customer has a rented flat" fire for every normal car+home owner.
      const target = parseFloat(value);
      if (isNaN(target)) return false;
      const homeCount = profile.activePolicies.filter((p) => {
        if (p.category !== "PROPERTY") return false;
        const sub = (p.subType || "").toLowerCase();
        return sub.includes("דירה") || sub.includes("מבנה");
      }).length;
      return compareNumber(homeCount, operator, target);
    }

    case "car_policy_count": {
      const target = parseFloat(value);
      if (isNaN(target)) return false;
      const carCount = profile.activePolicies.filter((p) => {
        if (p.category !== "PROPERTY") return false;
        const sub = (p.subType || "").toLowerCase();
        return sub.includes("רכב");
      }).length;
      return compareNumber(carCount, operator, target);
    }

    case "savings": {
      const threshold = parseFloat(value);
      if (isNaN(threshold)) return false;
      return compareNumber(
        profile.totalAccumulatedSavings,
        operator,
        threshold
      );
    }

    case "management_fee": {
      const threshold = parseFloat(value);
      if (isNaN(threshold)) return false;
      const maxFee = profile.maxManagementFeePercent;
      if (maxFee == null) return false;
      return compareNumber(maxFee, operator, threshold);
    }

    case "months_since_review": {
      // Null lastReviewDate = treat as "never reviewed" = infinity.
      // Lets us write "months_since_review > 18" as "never or > 18mo ago".
      const threshold = parseFloat(value);
      if (isNaN(threshold)) return false;
      const last = profile.customer.lastReviewDate;
      if (!last) return compareNumber(Number.POSITIVE_INFINITY, operator, threshold);
      const months =
        (Date.now() - new Date(last).getTime()) /
        (30.44 * 24 * 60 * 60 * 1000);
      return compareNumber(months, operator, threshold);
    }

    case "external_policy_expiring_within_days": {
      // Matches when the customer has at least one Policy sourced from
      // Har HaBituach whose endDate sits in the window (0, N] days from
      // now. Already-expired policies (diff < 0) don't count — Rafi's
      // "golden window" concept is strictly forward-looking.
      const threshold = parseFloat(value);
      if (isNaN(threshold)) return false;
      const now = Date.now();
      return profile.activePolicies.some((p) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const anyP = p as any;
        if (anyP.externalSource !== "HAR_HABITUACH") return false;
        if (!p.endDate) return false;
        const daysLeft =
          (new Date(p.endDate).getTime() - now) / (24 * 60 * 60 * 1000);
        if (daysLeft <= 0) return false;
        return compareNumber(daysLeft, operator, threshold);
      });
    }

    default:
      // Unknown field = no match
      return false;
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
