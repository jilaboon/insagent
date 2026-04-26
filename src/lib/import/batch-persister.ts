/**
 * Batch Persister: Uses raw SQL INSERT ON CONFLICT for fast bulk imports.
 * One round-trip to the DB per batch instead of hundreds of individual queries.
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
 * Persist all merged customers using batch SQL operations.
 * Much faster than individual Prisma queries for remote databases.
 */
export async function batchPersistCustomers(
  customers: MergedCustomer[],
  importJobId: string
): Promise<PersistResult> {
  let created = 0;
  let updated = 0;
  let failed = 0;
  const errors: Array<{ israeliId: string; error: string }> = [];

  // Process in batches of 100 customers per SQL statement
  const BATCH = 100;

  for (let i = 0; i < customers.length; i += BATCH) {
    const batch = customers.slice(i, i + BATCH);

    try {
      const result = await upsertCustomerBatch(batch, importJobId);
      created += result.created;
      updated += result.updated;
    } catch (err) {
      // Fallback: try one by one for this batch
      for (const c of batch) {
        try {
          const r = await upsertCustomerBatch([c], importJobId);
          created += r.created;
          updated += r.updated;
        } catch (e) {
          failed++;
          errors.push({
            israeliId: c.israeliId,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }
    }
  }

  return { created, updated, failed, errors };
}

async function upsertCustomerBatch(
  customers: MergedCustomer[],
  importJobId: string
): Promise<{ created: number; updated: number }> {
  if (customers.length === 0) return { created: 0, updated: 0 };

  // Step 1: Upsert customers
  const customerValues = customers.map((c) => {
    const cust = c.customer;
    return `(
      gen_random_uuid(),
      ${esc(c.israeliId)},
      ${esc(cust.firstName || "לא ידוע")},
      ${esc(cust.lastName || "")},
      ${esc(cust.address)},
      ${esc(cust.phone)},
      ${esc(cust.email)},
      ${escInt(cust.age)},
      ${escDate(cust.dateOfBirth)},
      ${esc(cust.maritalStatus)},
      ${esc(cust.gender)},
      NOW(),
      NOW(),
      NOW()
    )`;
  });

  // Use a CTE to get back which were inserted vs updated
  const customerSql = `
    INSERT INTO customers (id, "israeliId", "firstName", "lastName", address, phone, email, age, "dateOfBirth", "maritalStatus", gender, "lastImportDate", "createdAt", "updatedAt")
    VALUES ${customerValues.join(",\n")}
    ON CONFLICT ("israeliId") DO UPDATE SET
      "firstName" = COALESCE(NULLIF(EXCLUDED."firstName", 'לא ידוע'), customers."firstName"),
      "lastName" = COALESCE(NULLIF(EXCLUDED."lastName", ''), customers."lastName"),
      address = COALESCE(EXCLUDED.address, customers.address),
      phone = COALESCE(EXCLUDED.phone, customers.phone),
      email = COALESCE(EXCLUDED.email, customers.email),
      age = COALESCE(EXCLUDED.age, customers.age),
      "dateOfBirth" = COALESCE(EXCLUDED."dateOfBirth", customers."dateOfBirth"),
      "maritalStatus" = COALESCE(EXCLUDED."maritalStatus", customers."maritalStatus"),
      gender = COALESCE(EXCLUDED.gender, customers.gender),
      "lastImportDate" = NOW(),
      "updatedAt" = NOW()
    RETURNING id, "israeliId", (xmax = 0) AS is_new
  `;

  const customerResults: Array<{ id: string; israeliId: string; is_new: boolean }> =
    await prisma.$queryRawUnsafe(customerSql);

  // Build israeliId -> db id map
  const idMap = new Map<string, string>();
  let newCount = 0;
  let updateCount = 0;
  for (const r of customerResults) {
    idMap.set(r.israeliId, r.id);
    if (r.is_new) newCount++;
    else updateCount++;
  }

  // Step 2: Upsert policies
  const policyValues: string[] = [];
  for (const c of customers) {
    const customerId = idMap.get(c.israeliId);
    if (!customerId) continue;

    for (const p of c.policies) {
      if (!p.policyNumber) continue;
      policyValues.push(`(
        gen_random_uuid(),
        ${esc(customerId)},
        ${esc(p.policyNumber)},
        ${esc(p.insurer || "")},
        ${esc(p.category)}::"PolicyCategory",
        ${esc(p.subType)},
        ${esc(p.status)}::"PolicyStatus",
        ${esc(p.productName)},
        ${escDate(p.startDate)},
        ${escDate(p.endDate)},
        ${escNum(p.premiumMonthly)},
        ${escNum(p.premiumAnnual)},
        ${esc(p.accountType)},
        ${esc(p.employer)},
        ${escNum(p.accumulatedSavings)},
        ${escNum(p.redemptionValue)},
        ${escNum(p.managementFeeFromAccumulation)},
        ${escNum(p.managementFeeFromPremium)},
        ${escDate(p.dataFreshnessDate)},
        ${escInt(p.vehicleYear)},
        ${esc(p.vehiclePlate)},
        ${esc(p.vehicleModel)},
        ${esc(p.propertyAddress)},
        ${esc(importJobId)},
        NOW(),
        NOW()
      )`);
    }
  }

  if (policyValues.length > 0) {
    const policySql = `
      INSERT INTO policies (id, "customerId", "policyNumber", insurer, category, "subType", status, "productName", "startDate", "endDate", "premiumMonthly", "premiumAnnual", "accountType", employer, "accumulatedSavings", "redemptionValue", "feeOnAccumulationPct", "feeOnPremiumPct", "dataFreshnessDate", "vehicleYear", "vehiclePlate", "vehicleModel", "propertyAddress", "importJobId", "createdAt", "updatedAt")
      VALUES ${policyValues.join(",\n")}
      ON CONFLICT ("customerId", "policyNumber", insurer) DO UPDATE SET
        category = EXCLUDED.category,
        "subType" = COALESCE(EXCLUDED."subType", policies."subType"),
        status = EXCLUDED.status,
        "productName" = COALESCE(EXCLUDED."productName", policies."productName"),
        "startDate" = COALESCE(EXCLUDED."startDate", policies."startDate"),
        "endDate" = COALESCE(EXCLUDED."endDate", policies."endDate"),
        "premiumMonthly" = COALESCE(EXCLUDED."premiumMonthly", policies."premiumMonthly"),
        "premiumAnnual" = COALESCE(EXCLUDED."premiumAnnual", policies."premiumAnnual"),
        "accountType" = COALESCE(EXCLUDED."accountType", policies."accountType"),
        employer = COALESCE(EXCLUDED.employer, policies.employer),
        "accumulatedSavings" = COALESCE(EXCLUDED."accumulatedSavings", policies."accumulatedSavings"),
        "redemptionValue" = COALESCE(EXCLUDED."redemptionValue", policies."redemptionValue"),
        "feeOnAccumulationPct" = COALESCE(EXCLUDED."feeOnAccumulationPct", policies."feeOnAccumulationPct"),
        "feeOnPremiumPct" = COALESCE(EXCLUDED."feeOnPremiumPct", policies."feeOnPremiumPct"),
        "dataFreshnessDate" = COALESCE(EXCLUDED."dataFreshnessDate", policies."dataFreshnessDate"),
        "vehicleYear" = COALESCE(EXCLUDED."vehicleYear", policies."vehicleYear"),
        "vehiclePlate" = COALESCE(EXCLUDED."vehiclePlate", policies."vehiclePlate"),
        "vehicleModel" = COALESCE(EXCLUDED."vehicleModel", policies."vehicleModel"),
        "propertyAddress" = COALESCE(EXCLUDED."propertyAddress", policies."propertyAddress"),
        "importJobId" = EXCLUDED."importJobId",
        "updatedAt" = NOW()
    `;

    await prisma.$executeRawUnsafe(policySql);
  }

  // Step 3: Link import job to customers
  const linkValues = Array.from(idMap.entries()).map(
    ([israeliId, customerId]) => {
      const isNew = customerResults.find((r) => r.israeliId === israeliId)?.is_new;
      return `(gen_random_uuid(), ${esc(importJobId)}, ${esc(customerId)}, ${esc(isNew ? "new" : "exact")}, NOW())`;
    }
  );

  if (linkValues.length > 0) {
    const linkSql = `
      INSERT INTO import_job_customers (id, "importJobId", "customerId", "matchType", "createdAt")
      VALUES ${linkValues.join(",\n")}
      ON CONFLICT ("importJobId", "customerId") DO UPDATE SET "matchType" = EXCLUDED."matchType"
    `;
    await prisma.$executeRawUnsafe(linkSql);
  }

  return { created: newCount, updated: updateCount };
}

// ============================================================
// SQL escape helpers
// ============================================================

function esc(val: string | null | undefined): string {
  if (val == null) return "NULL";
  // Escape single quotes by doubling them
  return `'${val.replace(/'/g, "''")}'`;
}

function escNum(val: number | null | undefined): string {
  if (val == null) return "NULL";
  if (isNaN(val)) return "NULL";
  return String(val);
}

function escInt(val: number | null | undefined): string {
  if (val == null) return "NULL";
  if (isNaN(val)) return "NULL";
  return String(Math.round(val));
}

function escDate(val: Date | null | undefined): string {
  if (val == null) return "NULL";
  const d = val instanceof Date ? val : new Date(val);
  if (isNaN(d.getTime())) return "NULL";
  return `'${d.toISOString()}'`;
}
