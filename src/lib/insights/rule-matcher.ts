/**
 * Dynamic Rule Matcher
 *
 * Parses triggerCondition strings from OfficeRule records
 * and evaluates them against a CustomerProfile.
 *
 * Supported condition patterns:
 *   age >= 60, age < 50
 *   policy_category = LIFE
 *   no_policy_category = HEALTH
 *   policy_subtype = רכב
 *   policy_age_years > 3
 *   vehicle_age <= 2
 *   policy_count = 1, policy_count >= 2
 *   category_count = 1
 *   property_policy_count >= 2
 *   has_expiring_policy
 *   savings > 100000
 *   management_fee > 1.5
 *   has_life_and_elementary
 *   travel_season
 *   always
 *   AND combinations
 */

import type { OfficeRule } from "@prisma/client";
import type { CustomerProfile } from "./rules/types";

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
    // Split by AND and evaluate each sub-condition
    const parts = condition.split(/\s+AND\s+/);
    return parts.every((part) => evaluateCondition(part.trim(), profile));
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

    default:
      // Unknown field = no match
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
