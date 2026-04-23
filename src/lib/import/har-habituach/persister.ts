/**
 * Persist merged Har HaBituach customers to Prisma.
 *
 * Behavior:
 * - For each customer (by israeliId):
 *     - If EXISTS in DB: update lastHarHabituachImportAt (and set firstSeenIn…
 *       once). Do NOT overwrite name/phone/email — office data is authoritative.
 *     - If MISSING: create with source="HAR_HABITUACH_ONLY". This is the
 *       "143 prospects" path. Name split via splitHebrewName.
 * - For each policy in the customer (dedup key = customerId,policyNumber,insurer):
 *     - If matching Policy EXISTS: update harHabituachLastSeenAt (first if null).
 *       Do NOT overwrite premium/dates — office data is authoritative.
 *     - If MISSING: create with externalSource="HAR_HABITUACH".
 *
 * Batched via a transaction per customer to keep the model simple and fit
 * within the existing import request window. Errors per customer are caught
 * and recorded in errors[]; we don't abort the whole import on one bad row.
 */

import { prisma } from "@/lib/db";
import type { MergedHarHabituachCustomer } from "./merger";
import { splitHebrewName } from "./merger";

export interface PersistResult {
  customersExisting: number;
  customersCreated: number;
  policiesMatched: number;    // already existed, timestamps updated
  policiesCreated: number;    // new external policies added
  errors: Array<{ israeliId: string; error: string }>;
  affectedCustomerIds: string[];
}

export async function persistHarHabituach(
  merged: MergedHarHabituachCustomer[],
  importJobId: string
): Promise<PersistResult> {
  const result: PersistResult = {
    customersExisting: 0,
    customersCreated: 0,
    policiesMatched: 0,
    policiesCreated: 0,
    errors: [],
    affectedCustomerIds: [],
  };

  const now = new Date();

  for (const mc of merged) {
    try {
      await prisma.$transaction(async (tx) => {
        // 1) Upsert customer
        const existing = await tx.customer.findUnique({
          where: { israeliId: mc.israeliId },
          select: { id: true, firstSeenInHarHabituachAt: true },
        });

        let customerId: string;
        let isNew = false;

        if (existing) {
          customerId = existing.id;
          await tx.customer.update({
            where: { id: existing.id },
            data: {
              lastHarHabituachImportAt: now,
              firstSeenInHarHabituachAt:
                existing.firstSeenInHarHabituachAt ?? now,
              // IMPORTANT: never overwrite name/phone/email from Har HaBituach;
              // office data is authoritative.
            },
          });
          result.customersExisting += 1;
        } else {
          const { firstName, lastName } = splitHebrewName(mc.customerName);
          const created = await tx.customer.create({
            data: {
              israeliId: mc.israeliId,
              firstName,
              lastName,
              source: "HAR_HABITUACH_ONLY",
              firstSeenInHarHabituachAt: now,
              lastHarHabituachImportAt: now,
            },
            select: { id: true },
          });
          customerId = created.id;
          isNew = true;
          result.customersCreated += 1;
        }

        result.affectedCustomerIds.push(customerId);

        // 2) Link customer to this import job
        await tx.importJobCustomer.upsert({
          where: {
            importJobId_customerId: { importJobId, customerId },
          },
          create: {
            importJobId,
            customerId,
            matchType: isNew ? "new" : "exact",
          },
          update: {},
        });

        // 3) Upsert policies
        for (const p of mc.policies) {
          const existingPolicy = await tx.policy.findUnique({
            where: {
              customerId_policyNumber_insurer: {
                customerId,
                policyNumber: p.policyNumber,
                insurer: p.insurer,
              },
            },
            select: { id: true, harHabituachFirstSeenAt: true },
          });

          if (existingPolicy) {
            // Policy already known to us (from office BAFI). Just record that
            // Har HaBituach confirms it, leave commercial fields untouched.
            await tx.policy.update({
              where: { id: existingPolicy.id },
              data: {
                harHabituachLastSeenAt: now,
                harHabituachFirstSeenAt:
                  existingPolicy.harHabituachFirstSeenAt ?? now,
              },
            });
            result.policiesMatched += 1;
          } else {
            // New external policy — the whole point of the import
            await tx.policy.create({
              data: {
                customerId,
                policyNumber: p.policyNumber,
                insurer: p.insurer,
                category: p.category,
                subType: p.subType,
                status: "ACTIVE",
                productName: p.productType,
                startDate: p.startDate,
                endDate: p.endDate,
                premiumMonthly: p.premiumMonthly,
                premiumAnnual: p.premiumAnnual,
                dataFreshnessDate: p.dataFreshnessDate,
                importJobId,
                externalSource: "HAR_HABITUACH",
                harHabituachFirstSeenAt: now,
                harHabituachLastSeenAt: now,
              },
            });
            result.policiesCreated += 1;
          }
        }
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Don't log the full row/customer object — message only (no PII).
      result.errors.push({
        israeliId: mc.israeliId,
        error: msg.slice(0, 200),
      });
    }
  }

  return result;
}
