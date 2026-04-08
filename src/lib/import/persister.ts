/**
 * Persister: Upserts merged customer data into PostgreSQL via Prisma.
 * Processes in batches to avoid memory/timeout issues.
 */

import { prisma } from "@/lib/db";
import type { MergedCustomer } from "./merger";

const BATCH_SIZE = 50;

export interface PersistResult {
  created: number;
  updated: number;
  failed: number;
  errors: Array<{ israeliId: string; error: string }>;
}

export interface PersistProgress {
  processed: number;
  total: number;
  created: number;
  updated: number;
  failed: number;
}

/**
 * Persist all merged customers to the database.
 * Processes in batches to manage memory and transaction size.
 */
export async function persistMergedCustomers(
  customers: MergedCustomer[],
  importJobId: string,
  onProgress?: (progress: PersistProgress) => void
): Promise<PersistResult> {
  const result: PersistResult = { created: 0, updated: 0, failed: 0, errors: [] };
  const total = customers.length;

  for (let i = 0; i < customers.length; i += BATCH_SIZE) {
    const batch = customers.slice(i, i + BATCH_SIZE);

    for (const merged of batch) {
      try {
        const wasCreated = await persistOneCustomer(merged, importJobId);
        if (wasCreated) result.created++;
        else result.updated++;
      } catch (err) {
        result.failed++;
        result.errors.push({
          israeliId: merged.israeliId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    onProgress?.({
      processed: Math.min(i + BATCH_SIZE, total),
      total,
      created: result.created,
      updated: result.updated,
      failed: result.failed,
    });
  }

  return result;
}

/**
 * Persist a single merged customer and all their policies.
 * Returns true if the customer was newly created.
 */
async function persistOneCustomer(
  merged: MergedCustomer,
  importJobId: string
): Promise<boolean> {
  const { israeliId, customer, policies } = merged;
  if (!israeliId) throw new Error("Missing Israeli ID");

  // Check if customer exists
  const existing = await prisma.customer.findUnique({
    where: { israeliId },
    select: { id: true },
  });

  const isNew = !existing;

  // Upsert customer
  const dbCustomer = await prisma.customer.upsert({
    where: { israeliId },
    create: {
      israeliId,
      firstName: customer.firstName || "לא ידוע",
      lastName: customer.lastName || "",
      address: customer.address,
      phone: customer.phone,
      email: customer.email,
      age: customer.age,
      dateOfBirth: customer.dateOfBirth,
      maritalStatus: customer.maritalStatus,
      gender: customer.gender,
      lastImportDate: new Date(),
    },
    update: {
      firstName: customer.firstName || undefined,
      lastName: customer.lastName || undefined,
      address: customer.address || undefined,
      phone: customer.phone || undefined,
      email: customer.email || undefined,
      age: customer.age || undefined,
      dateOfBirth: customer.dateOfBirth || undefined,
      maritalStatus: customer.maritalStatus || undefined,
      gender: customer.gender || undefined,
      lastImportDate: new Date(),
    },
  });

  // Upsert policies
  for (const policy of policies) {
    if (!policy.policyNumber) continue;

    // Find existing policy by policyNumber + insurer for this customer
    const existingPolicy = await prisma.policy.findFirst({
      where: {
        customerId: dbCustomer.id,
        policyNumber: policy.policyNumber,
        insurer: policy.insurer || "",
      },
      select: { id: true },
    });

    const policyData = {
      policyNumber: policy.policyNumber,
      insurer: policy.insurer || "",
      category: policy.category,
      subType: policy.subType,
      status: policy.status,
      productName: policy.productName,
      startDate: policy.startDate,
      endDate: policy.endDate,
      premiumMonthly: policy.premiumMonthly,
      premiumAnnual: policy.premiumAnnual,
      accountType: policy.accountType,
      employer: policy.employer,
      accumulatedSavings: policy.accumulatedSavings,
      redemptionValue: policy.redemptionValue,
      dataFreshnessDate: policy.dataFreshnessDate,
      vehicleYear: policy.vehicleYear,
      vehiclePlate: policy.vehiclePlate,
      vehicleModel: policy.vehicleModel,
      propertyAddress: policy.propertyAddress,
      importJobId,
    };

    let policyId: string;

    if (existingPolicy) {
      await prisma.policy.update({
        where: { id: existingPolicy.id },
        data: policyData,
      });
      policyId = existingPolicy.id;
    } else {
      const created = await prisma.policy.create({
        data: {
          ...policyData,
          customerId: dbCustomer.id,
        },
      });
      policyId = created.id;
    }

    // Upsert investment track if present
    if (policy.trackName && policy.trackAccumulation) {
      // Delete existing tracks for this policy and recreate
      await prisma.investmentTrack.deleteMany({
        where: { policyId },
      });

      await prisma.investmentTrack.create({
        data: {
          policyId,
          name: policy.trackName,
          depositType: policy.investmentChannel,
          accumulatedAmount: policy.trackAccumulation,
        },
      });
    }

    // Upsert management fees if present
    if (
      policy.managementFeeFromAccumulation != null ||
      policy.managementFeeFromPremium != null
    ) {
      await prisma.managementFee.deleteMany({
        where: { policyId },
      });

      if (policy.managementFeeFromAccumulation != null) {
        await prisma.managementFee.create({
          data: {
            policyId,
            feeType: "דמי ניהול מצבירה",
            ratePercent: policy.managementFeeFromAccumulation,
          },
        });
      }

      if (policy.managementFeeFromPremium != null) {
        await prisma.managementFee.create({
          data: {
            policyId,
            feeType: "דמי ניהול מהפקדה",
            ratePercent: policy.managementFeeFromPremium,
          },
        });
      }
    }
  }

  // Create import job link
  await prisma.importJobCustomer.upsert({
    where: {
      importJobId_customerId: {
        importJobId,
        customerId: dbCustomer.id,
      },
    },
    create: {
      importJobId,
      customerId: dbCustomer.id,
      matchType: isNew ? "new" : "exact",
    },
    update: {
      matchType: isNew ? "new" : "exact",
    },
  });

  return isNew;
}
