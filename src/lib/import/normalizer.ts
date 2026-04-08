/**
 * Normalizer: Converts raw CSV rows into a unified intermediate format
 * that works across both life and elementary insurance data.
 */

import type { PolicyCategory, PolicyStatus } from "@/generated/prisma/client";
import type { LifeNormalizedRow } from "./column-maps/life-columns";
import type { ElementaryNormalizedRow } from "./column-maps/elementary-columns";

// ============================================================
// Unified normalized format
// ============================================================

export interface NormalizedCustomer {
  israeliId: string;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  age: number | null;
  dateOfBirth: Date | null;
  gender: string | null;
  maritalStatus: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  employer: string | null;
}

export interface NormalizedPolicy {
  policyNumber: string;
  insurer: string;
  category: PolicyCategory;
  subType: string | null;
  status: PolicyStatus;
  productName: string | null;
  startDate: Date | null;
  endDate: Date | null;
  premiumMonthly: number | null;
  premiumAnnual: number | null;
  accountType: string | null;
  employer: string | null;
  accumulatedSavings: number | null;
  redemptionValue: number | null;
  dataFreshnessDate: Date | null;
  // Vehicle
  vehicleYear: number | null;
  vehiclePlate: string | null;
  vehicleModel: string | null;
  // Property
  propertyAddress: string | null;
  // Investment
  trackName: string | null;
  trackAccumulation: number | null;
  investmentChannel: string | null;
  // Fees
  managementFeeFromAccumulation: number | null;
  managementFeeFromPremium: number | null;
  // Contributions
  lastDeposit: number | null;
}

export interface NormalizedRecord {
  customer: NormalizedCustomer;
  policy: NormalizedPolicy;
  branch: "LIFE" | "ELEMENTARY";
  sourceFile: string;
  sourceRow: number;
}

// ============================================================
// Name parsing helper
// ============================================================

function splitName(fullName: string | null, firstName: string | null): {
  firstName: string;
  lastName: string;
} {
  if (firstName && fullName) {
    // Full name minus first name = last name
    const lastPart = fullName.replace(firstName, "").trim();
    return { firstName: firstName.trim(), lastName: lastPart || fullName.trim() };
  }
  if (fullName) {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length >= 2) {
      return { firstName: parts[parts.length - 1], lastName: parts.slice(0, -1).join(" ") };
    }
    return { firstName: fullName.trim(), lastName: "" };
  }
  return { firstName: firstName?.trim() || "", lastName: "" };
}

// ============================================================
// Converters
// ============================================================

export function normalizeLifeRow(
  row: LifeNormalizedRow,
  sourceFile: string
): NormalizedRecord {
  const { firstName, lastName } = splitName(row.customer.fullName, row.customer.firstName);

  return {
    customer: {
      israeliId: row.customer.israeliId,
      firstName,
      lastName,
      fullName: row.customer.fullName,
      age: row.customer.age,
      dateOfBirth: row.customer.dateOfBirth,
      gender: row.customer.gender,
      maritalStatus: row.customer.maritalStatus,
      address: row.customer.address,
      phone: row.customer.phone,
      email: row.customer.email,
      employer: row.customer.employer,
    },
    policy: {
      policyNumber: row.policy.policyNumber,
      insurer: row.policy.insurer || row.policy.insurerName || "",
      category: row.policy.category,
      subType: row.policy.subType,
      status: row.policy.status,
      productName: row.policy.planName || row.policy.productName,
      startDate: row.policy.startDate,
      endDate: null, // Life policies typically don't have end dates in this format
      premiumMonthly: row.policy.premiumMonthly,
      premiumAnnual: row.policy.premiumMonthly ? row.policy.premiumMonthly * 12 : null,
      accountType: row.policy.accountType,
      employer: row.policy.employer,
      accumulatedSavings: row.policy.accumulatedSavings,
      redemptionValue: row.policy.redemptionValue,
      dataFreshnessDate: row.policy.asOfDate,
      vehicleYear: null,
      vehiclePlate: null,
      vehicleModel: null,
      propertyAddress: null,
      trackName: row.policy.trackName,
      trackAccumulation: row.policy.trackAccumulation,
      investmentChannel: row.policy.investmentChannel,
      managementFeeFromAccumulation: row.policy.managementFeeFromAccumulation,
      managementFeeFromPremium: row.policy.managementFeeFromPremium,
      lastDeposit: row.policy.lastDeposit,
    },
    branch: "LIFE",
    sourceFile,
    sourceRow: row.sourceRow,
  };
}

export function normalizeElementaryRow(
  row: ElementaryNormalizedRow,
  sourceFile: string
): NormalizedRecord {
  // Elementary CSV only has firstName (which is actually the full name/company name)
  const name = row.customer.firstName || "";
  const parts = name.trim().split(/\s+/);
  let firstName = name;
  let lastName = "";

  // Try to split — for Hebrew names, first name is usually last
  if (parts.length >= 2 && row.customer.insuredType !== "חברה") {
    firstName = parts[parts.length - 1];
    lastName = parts.slice(0, -1).join(" ");
  }

  // Determine property address from branch type
  let propertyAddress: string | null = null;
  const sub = row.policy.subType?.toLowerCase() || "";
  if (sub === "דירה" || sub === "עסק") {
    propertyAddress = row.customer.address;
  }

  return {
    customer: {
      israeliId: row.customer.israeliId,
      firstName,
      lastName,
      fullName: name,
      age: row.customer.age,
      dateOfBirth: row.customer.dateOfBirth,
      gender: row.customer.gender,
      maritalStatus: row.customer.maritalStatus,
      address: row.customer.address,
      phone: row.customer.phone,
      email: row.customer.email,
      employer: row.customer.employer,
    },
    policy: {
      policyNumber: row.policy.policyNumber,
      insurer: row.policy.insurer,
      category: row.policy.category,
      subType: row.policy.subType,
      status: row.policy.status,
      productName: row.policy.branchName,
      startDate: row.policy.startDate,
      endDate: row.policy.endDate,
      premiumMonthly: null,
      premiumAnnual: row.policy.premium,
      accountType: null,
      employer: null,
      accumulatedSavings: null,
      redemptionValue: null,
      dataFreshnessDate: row.policy.endDate, // End date is the freshness indicator for elementary
      vehicleYear: row.policy.vehicleYear,
      vehiclePlate: row.policy.vehicleNumber,
      vehicleModel: row.policy.vehicleModel,
      propertyAddress,
      trackName: null,
      trackAccumulation: null,
      investmentChannel: null,
      managementFeeFromAccumulation: null,
      managementFeeFromPremium: null,
      lastDeposit: null,
    },
    branch: "ELEMENTARY",
    sourceFile,
    sourceRow: row.sourceRow,
  };
}
