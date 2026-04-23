/**
 * Merge normalized Har HaBituach rows into MergedCustomers.
 *
 * Input: array of HarHabituachNormalizedRow (one per xlsx line — which is
 * actually one per coverage, so the same policy can appear multiple times).
 *
 * Output: MergedHarHabituachCustomer[] — one per unique ת.ז., with its
 * distinct policies deduped by (policyNumber, insurer).
 */

import type { HarHabituachNormalizedRow } from "./columns";
import type { PolicyCategory } from "@prisma/client";

export interface MergedHarHabituachCustomer {
  israeliId: string;
  customerName: string | null;
  policies: MergedHarHabituachPolicy[];
}

export interface MergedHarHabituachPolicy {
  policyNumber: string;
  insurer: string;
  category: PolicyCategory;
  subType: string | null;
  productType: string | null;
  planClass: string | null;
  premium: number | null;
  premiumMonthly: number | null;
  premiumAnnual: number | null;
  startDate: Date | null;
  endDate: Date | null;
  dataFreshnessDate: Date | null;
  /** How many rows (coverages) contributed to this dedup bucket. */
  coverageRowCount: number;
}

export function mergeHarHabituachRows(
  rows: HarHabituachNormalizedRow[]
): MergedHarHabituachCustomer[] {
  const byCustomer = new Map<string, MergedHarHabituachCustomer>();

  for (const row of rows) {
    let customer = byCustomer.get(row.israeliId);
    if (!customer) {
      customer = {
        israeliId: row.israeliId,
        customerName: row.customerName,
        policies: [],
      };
      byCustomer.set(row.israeliId, customer);
    } else if (!customer.customerName && row.customerName) {
      // Prefer any non-null name we see
      customer.customerName = row.customerName;
    }

    // Dedup policies within a single customer by (policyNumber, insurer).
    // Multiple rows for the same policy (different coverages) collapse into
    // one record — we pick the row with the LARGEST premium as the primary
    // signal, because that's usually the comprehensive/main coverage line.
    const key = `${row.policyNumber}::${row.insurer}`;
    const existing = customer.policies.find(
      (p) => `${p.policyNumber}::${p.insurer}` === key
    );

    if (!existing) {
      customer.policies.push({
        policyNumber: row.policyNumber,
        insurer: row.insurer,
        category: row.category,
        subType: row.subType,
        productType: row.productType,
        planClass: row.planClass,
        premium: row.premium,
        premiumMonthly: row.premiumMonthly,
        premiumAnnual: row.premiumAnnual,
        startDate: row.startDate,
        endDate: row.endDate,
        dataFreshnessDate: row.dataFreshnessDate,
        coverageRowCount: 1,
      });
    } else {
      existing.coverageRowCount += 1;
      // Keep the row with the larger premium as the summary record
      const existingPremium = existing.premium ?? 0;
      const rowPremium = row.premium ?? 0;
      if (rowPremium > existingPremium) {
        existing.premium = row.premium;
        existing.premiumMonthly = row.premiumMonthly;
        existing.premiumAnnual = row.premiumAnnual;
        existing.subType = row.subType;
      }
      // Prefer the widest coverage period if both have one
      if (
        row.startDate &&
        (!existing.startDate || row.startDate < existing.startDate)
      ) {
        existing.startDate = row.startDate;
      }
      if (
        row.endDate &&
        (!existing.endDate || row.endDate > existing.endDate)
      ) {
        existing.endDate = row.endDate;
      }
      if (
        row.dataFreshnessDate &&
        (!existing.dataFreshnessDate ||
          row.dataFreshnessDate > existing.dataFreshnessDate)
      ) {
        existing.dataFreshnessDate = row.dataFreshnessDate;
      }
    }
  }

  return Array.from(byCustomer.values());
}

/**
 * Split a Hebrew full-name string into firstName / lastName.
 * Heuristic: last whitespace-separated token is lastName, rest is firstName.
 * Used only when CREATING a new customer from Har HaBituach (source=HAR_HABITUACH_ONLY).
 * Existing office customers keep their original names untouched.
 */
export function splitHebrewName(
  fullName: string | null
): { firstName: string; lastName: string } {
  if (!fullName || !fullName.trim()) {
    return { firstName: "", lastName: "לא ידוע" };
  }
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: "" };
  }
  const lastName = parts[parts.length - 1];
  const firstName = parts.slice(0, -1).join(" ");
  return { firstName, lastName };
}
