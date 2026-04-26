/**
 * PII sanitization for AI data minimization.
 *
 * CRITICAL: Never send the following to external AI APIs:
 * - ת.ז. (Israeli ID)
 * - Phone numbers
 * - Email addresses
 * - Full addresses
 * - Policy numbers
 * - Vehicle plate numbers
 */

/**
 * Sanitize evidence JSON before sending to AI.
 * Strips all PII fields and keeps only safe analytical data.
 */
export function sanitizeEvidenceForAI(
  evidence: Record<string, unknown>
): Record<string, unknown> {
  const PII_KEYS = new Set([
    "israeliId",
    "israeli_id",
    "tz",
    "phone",
    "email",
    "address",
    "policyNumber",
    "policy_number",
    "vehiclePlate",
    "vehicle_plate",
    "propertyAddress",
    "property_address",
    "lastName",
    "last_name",
    "fullName",
    "full_name",
  ]);

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(evidence)) {
    if (PII_KEYS.has(key)) continue;

    // Recursively sanitize nested objects
    if (value && typeof value === "object" && !Array.isArray(value)) {
      sanitized[key] = sanitizeEvidenceForAI(
        value as Record<string, unknown>
      );
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Build a safe customer summary for AI message generation.
 * Only includes: first name, age, gender, and insight metadata.
 * NO: ת.ז., phone, email, address, policy numbers, plates.
 */
export function buildSafeCustomerContext(params: {
  firstName: string;
  age: number | null;
  gender: string | null;
  insightTitle: string;
  insightSummary: string;
  insightExplanation: string;
  policyCategory?: string;
  insurer?: string;
}): Record<string, unknown> {
  return {
    firstName: params.firstName,
    age: params.age,
    gender: params.gender,
    insightTitle: params.insightTitle,
    insightSummary: params.insightSummary,
    insightExplanation: params.insightExplanation,
    ...(params.policyCategory && { policyCategory: params.policyCategory }),
    ...(params.insurer && { insurer: params.insurer }),
  };
}

/**
 * Sanitize policy data for AI insight generation.
 * Strips policy numbers, keeps only analytical fields.
 * Premium values are rounded to ranges for extra safety.
 */
export function sanitizePolicyForAI(policy: {
  category: string;
  subType: string | null;
  insurer: string;
  status: string;
  premiumMonthly: number | null;
  premiumAnnual: number | null;
  accumulatedSavings: number | null;
  startDate: string | null;
  endDate: string | null;
  vehicleYear: number | null;
  feeOnAccumulationPct: number | null;
  feeOnPremiumPct: number | null;
}): Record<string, unknown> {
  return {
    category: policy.category,
    subType: policy.subType,
    insurer: policy.insurer,
    status: policy.status,
    premiumMonthly: policy.premiumMonthly,
    premiumAnnual: policy.premiumAnnual,
    accumulatedSavings: policy.accumulatedSavings
      ? roundToRange(policy.accumulatedSavings)
      : null,
    startDate: policy.startDate,
    endDate: policy.endDate,
    vehicleYear: policy.vehicleYear,
    feeOnAccumulationPct: policy.feeOnAccumulationPct,
    feeOnPremiumPct: policy.feeOnPremiumPct,
  };
}

/**
 * Round a number to a human-readable range for privacy.
 * e.g. 156,000 -> "150,000-200,000"
 */
function roundToRange(value: number): string {
  if (value < 10_000) return `עד 10,000`;
  if (value < 50_000) return `10,000-50,000`;
  if (value < 100_000) return `50,000-100,000`;
  if (value < 200_000) return `100,000-200,000`;
  if (value < 500_000) return `200,000-500,000`;
  if (value < 1_000_000) return `500,000-1,000,000`;
  return `מעל 1,000,000`;
}

/**
 * Mask Israeli ID: show first 2 digits + "****" + last digit.
 * e.g. "334567893" -> "33****3"
 */
export function maskIsraeliId(israeliId: string): string {
  if (!israeliId || israeliId.length < 4) return "****";
  return `${israeliId.slice(0, 2)}****${israeliId.slice(-1)}`;
}

/**
 * Mask vehicle plate: show "****" + last 3 digits only.
 * e.g. "1234567" -> "****567"
 */
export function maskVehiclePlate(plate: string): string {
  if (!plate || plate.length < 4) return "***";
  return `****${plate.slice(-3)}`;
}

/**
 * Mask phone number: show "****" + last 4 digits.
 * e.g. "0501234567" -> "****4567"
 */
export function maskPhone(phone: string): string {
  if (!phone || phone.length < 5) return "****";
  return `****${phone.slice(-4)}`;
}

/**
 * Mask policy number: show "****" + last 4 digits.
 * e.g. "POL123456789" -> "****6789"
 */
export function maskPolicyNumber(policyNumber: string): string {
  if (!policyNumber || policyNumber.length < 5) return "****";
  return `****${policyNumber.slice(-4)}`;
}
