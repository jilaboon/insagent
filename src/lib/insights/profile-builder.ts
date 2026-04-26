/**
 * Profile Builder: Loads a customer from Prisma with all relations
 * and computes aggregates needed for rule evaluation.
 */

import { prisma } from "@/lib/db";
import type { CustomerProfile, CategoryInfo } from "./rules/types";

export async function buildCustomerProfile(customerId: string): Promise<CustomerProfile | null> {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: {
      policies: {
        include: {
          coverages: true,
          investmentTracks: true,
          managementFees: true,
        },
      },
    },
  });

  if (!customer) return null;

  return computeProfile(customer);
}

export async function buildAllProfiles(): Promise<CustomerProfile[]> {
  const customers = await prisma.customer.findMany({
    include: {
      policies: {
        include: {
          coverages: true,
          investmentTracks: true,
          managementFees: true,
        },
      },
    },
  });

  return customers.map(computeProfile);
}

function computeProfile(
  customer: Awaited<ReturnType<typeof prisma.customer.findUnique>> & {
    policies: Array<
      Awaited<ReturnType<typeof prisma.policy.findFirst>> & {
        coverages: Awaited<ReturnType<typeof prisma.coverage.findMany>>;
        investmentTracks: Awaited<ReturnType<typeof prisma.investmentTrack.findMany>>;
        managementFees: Awaited<ReturnType<typeof prisma.managementFee.findMany>>;
      }
    >;
  }
): CustomerProfile {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = customer as any;
  const policies = c.policies || [];

  // CANCELLED / EXPIRED policies are never considered "active". The
  // matcher applies finer per-clause filtering (savings rules re-add
  // PAID_UP, premium rules drop FROZEN / PAID_UP / ARREARS) on top of
  // this set — see src/lib/insights/rule-matcher.ts.
  const activePolicies = policies.filter(
    (p: { status: string }) =>
      p.status === "ACTIVE" ||
      p.status === "PROPOSAL" ||
      p.status === "UNKNOWN"
  );

  // Category breakdown
  const categoryBreakdown = new Map<string, CategoryInfo>();
  for (const p of policies) {
    const cat = p.category as string;
    const existing = categoryBreakdown.get(cat) || {
      count: 0,
      activeCount: 0,
      totalPremium: 0,
      policies: [],
    };
    existing.count++;
    if (activePolicies.includes(p)) existing.activeCount++;
    existing.totalPremium += (p.premiumMonthly || 0) + (p.premiumAnnual || 0) / 12;
    existing.policies.push(p);
    categoryBreakdown.set(cat, existing);
  }

  // Aggregates
  let totalMonthlyPremium = 0;
  let totalAccumulatedSavings = 0;
  let nearestExpiry: Date | null = null;
  let oldestPolicyStartDate: Date | null = null;
  let maxManagementFeePercent: number | null = null;
  let hasLifeBranch = false;
  let hasElementaryBranch = false;

  for (const p of activePolicies) {
    totalMonthlyPremium += p.premiumMonthly || 0;
    if (p.premiumAnnual) totalMonthlyPremium += p.premiumAnnual / 12;
    totalAccumulatedSavings += p.accumulatedSavings || 0;

    if (p.endDate) {
      const end = new Date(p.endDate);
      if (!nearestExpiry || end < nearestExpiry) nearestExpiry = end;
    }

    if (p.startDate) {
      const start = new Date(p.startDate);
      if (!oldestPolicyStartDate || start < oldestPolicyStartDate) oldestPolicyStartDate = start;
    }

    // Check management fees
    for (const fee of p.managementFees || []) {
      if (fee.ratePercent != null) {
        if (maxManagementFeePercent == null || fee.ratePercent > maxManagementFeePercent) {
          maxManagementFeePercent = fee.ratePercent;
        }
      }
    }

    // Determine branches
    const cat = p.category as string;
    if (cat === "PROPERTY") hasElementaryBranch = true;
    else hasLifeBranch = true;
  }

  return {
    customer: c,
    totalMonthlyPremium,
    totalAnnualPremium: totalMonthlyPremium * 12,
    totalAccumulatedSavings,
    categoryBreakdown,
    activePolicies,
    nearestExpiry,
    oldestPolicyStartDate,
    hasLifeBranch,
    hasElementaryBranch,
    maxManagementFeePercent,
  };
}
