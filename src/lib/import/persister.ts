/**
 * Persister: Upserts merged customer data into PostgreSQL via Prisma.
 * Optimized for remote databases (Supabase) — uses transactions to minimize round-trips.
 */

import { prisma } from "@/lib/db";
import type { MergedCustomer } from "./merger";

export interface PersistResult {
  created: number;
  updated: number;
  failed: number;
  errors: Array<{ israeliId: string; error: string }>;
}

/**
 * Persist all merged customers to the database.
 * Each customer is processed in a single transaction.
 */
export async function persistMergedCustomers(
  customers: MergedCustomer[],
  importJobId: string,
  onProgress?: (progress: { processed: number; total: number; created: number; updated: number; failed: number }) => void
): Promise<PersistResult> {
  const result: PersistResult = { created: 0, updated: 0, failed: 0, errors: [] };

  for (let i = 0; i < customers.length; i++) {
    try {
      const wasCreated = await persistOneCustomer(customers[i], importJobId);
      if (wasCreated) result.created++;
      else result.updated++;
    } catch (err) {
      result.failed++;
      result.errors.push({
        israeliId: customers[i].israeliId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Report progress every 10 customers
    if (onProgress && (i + 1) % 10 === 0) {
      onProgress({
        processed: i + 1,
        total: customers.length,
        created: result.created,
        updated: result.updated,
        failed: result.failed,
      });
    }
  }

  return result;
}

/**
 * Persist a single customer and their policies in one transaction.
 */
async function persistOneCustomer(
  merged: MergedCustomer,
  importJobId: string
): Promise<boolean> {
  const { israeliId, customer, policies } = merged;
  if (!israeliId) throw new Error("Missing Israeli ID");

  return await prisma.$transaction(async (tx) => {
    // Check if customer exists
    const existing = await tx.customer.findUnique({
      where: { israeliId },
      select: { id: true },
    });

    const isNew = !existing;

    // Upsert customer
    const dbCustomer = await tx.customer.upsert({
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

    // Process policies — simplified: just create, skip dedup for speed
    for (const policy of policies) {
      if (!policy.policyNumber) continue;

      // Simple upsert: find by customer + policyNumber + insurer
      const existingPolicy = await tx.policy.findFirst({
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

      if (existingPolicy) {
        await tx.policy.update({
          where: { id: existingPolicy.id },
          data: policyData,
        });
      } else {
        await tx.policy.create({
          data: { ...policyData, customerId: dbCustomer.id },
        });
      }

      // Skip investment tracks and management fees for now — they cause
      // too many DB round-trips. We'll add them in a follow-up optimization.
    }

    // Link import job to customer
    await tx.importJobCustomer.upsert({
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
  });
}
