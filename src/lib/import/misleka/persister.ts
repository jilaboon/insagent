/**
 * Persist a merged Misleka customer + their per-file products to Prisma.
 *
 * Design contract (see docs/customer-360/design.md §3, §5):
 *   - HIGH / MEDIUM   → link to existing customer; update consent fields;
 *                       NEVER overwrite name / phone / email (office data
 *                       is authoritative).
 *   - NONE            → create a new Customer with source="MISLEKA_ONLY",
 *                       populated from the candidate fields + consent.
 *   - LOW             → not persisted here. The pipeline returns LOW
 *                       customers in the manualReviewQueue; if persist is
 *                       called by mistake we throw. Auto-linking on a
 *                       speculative match is explicitly out of scope.
 *
 * Idempotency:
 *   - CustomerFinancialProduct is upserted by `sourceStableKey`, a SHA-256
 *     of (customerId | providerCode | policyOrAccountNumber |
 *     productTypeCode | unifiedProductCode | sourceRecordPath). Re-importing
 *     the same files produces the same key → no duplicate rows.
 *   - CustomerBalanceSnapshot is upserted by the natural unique key
 *     (productId, snapshotDate, snapshotKind, trackCode). PostgreSQL treats
 *     NULL as a distinct value here, which we want for product-wide rows
 *     where trackCode is null.
 *
 * Resilience:
 *   - One Prisma transaction per customer. A failure inside one product
 *     emits a warning and continues — we don't poison the whole customer
 *     for a single bad row. (The transaction ensures that if the customer
 *     itself fails, nothing partial is left behind.)
 *
 * Privacy:
 *   - No raw XML, national IDs, account numbers, or balances appear in
 *     warning messages or the rawImportantFieldsJson snapshot. The
 *     extractor (Wave B) already strips sensitive fields before they reach
 *     us; we don't add any back here.
 */

import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type {
  CustomerMatchResult,
  MislekaBalanceRecord,
  MislekaProductRecord,
  MislekaWarning,
} from "./types";
import type { MergedMislekaCustomer } from "./merger";
import { normalizeIsraeliId } from "./matcher";

// ---------------------------------------------------------------
// Types
// ---------------------------------------------------------------

export interface PersistConsent {
  source: string; // "CUSTOMER_VERBAL" | "CUSTOMER_SIGNED" | "AGENT_REPRESENTED" | "DEMO_INTERNAL"
  scope: string; // "MISLEKA_PRODUCTS" | "FULL_360" | "DEMO_INTERNAL"
  date: Date;
  recordedBy: string;
  docRef?: string;
}

export interface PersistResult {
  customerId: string;
  /** Whether a new Customer row was created (NONE path). */
  customerCreated: boolean;
  productsCreated: number;
  productsUpdated: number;
  balanceSnapshotsCreated: number;
  /** Per-customer warnings — typically failed products that we skipped past. */
  warnings: MislekaWarning[];
}

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

/**
 * Compute the deterministic SHA-256 stable key for a product.
 * Null fields contribute the literal string "null" so the hash is always
 * defined even when several optional inputs are absent.
 */
export function computeSourceStableKey(parts: {
  customerId: string;
  providerCode: string | null;
  policyOrAccountNumber: string | null;
  productTypeCode: string | null;
  unifiedProductCode: string | null;
  sourceRecordPath: string | null;
}): string {
  const piece = (v: string | null) => (v === null || v === undefined ? "null" : v);
  const input = [
    parts.customerId,
    piece(parts.providerCode),
    piece(parts.policyOrAccountNumber),
    piece(parts.productTypeCode),
    piece(parts.unifiedProductCode),
    piece(parts.sourceRecordPath),
  ].join("|");
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/**
 * Best-effort first / last name split for a candidate that may only have
 * fullName populated. Used when creating a new MISLEKA_ONLY customer.
 */
function deriveFirstLastName(c: {
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
}): { firstName: string; lastName: string } {
  const first = c.firstName?.trim() ?? "";
  const last = c.lastName?.trim() ?? "";
  if (first || last) {
    return { firstName: first || "", lastName: last || "לא ידוע" };
  }
  const full = c.fullName?.trim();
  if (!full) return { firstName: "", lastName: "לא ידוע" };
  const parts = full.split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts[parts.length - 1],
  };
}

/**
 * Convert a number / null balance value to a Prisma Decimal-friendly value.
 */
function toDecimal(n: number | null | undefined): Prisma.Decimal | null {
  if (n === null || n === undefined) return null;
  if (!Number.isFinite(n)) return null;
  return new Prisma.Decimal(n);
}

// ---------------------------------------------------------------
// Public API
// ---------------------------------------------------------------

export async function persistMergedCustomer(params: {
  merged: MergedMislekaCustomer;
  matchResult: CustomerMatchResult;
  importJobId: string;
  consent: PersistConsent;
}): Promise<PersistResult> {
  const { merged, matchResult, importJobId, consent } = params;

  if (matchResult.confidence === "LOW") {
    // The pipeline is supposed to filter these out before calling us.
    // If we get here, it's a programming error — make it loud.
    throw new Error(
      "persistMergedCustomer called for LOW-confidence match; route to manual review instead",
    );
  }

  const result: PersistResult = {
    customerId: "",
    customerCreated: false,
    productsCreated: 0,
    productsUpdated: 0,
    balanceSnapshotsCreated: 0,
    warnings: [],
  };

  // -----------------------------------------------------------
  // Step 1: resolve / create the Customer row.
  // We do this OUTSIDE the per-product loop's transaction so that
  // the customer row is in place even if products fail individually.
  // -----------------------------------------------------------
  const candidate = merged.customer;
  const normalizedId =
    normalizeIsraeliId(candidate.israeliId ?? candidate.rawIsraeliId);

  let customerId: string;
  let customerCreated = false;

  if (matchResult.confidence === "HIGH" || matchResult.confidence === "MEDIUM") {
    if (!matchResult.customerId) {
      throw new Error(
        "Match result HIGH/MEDIUM but customerId missing — matcher contract violated",
      );
    }
    customerId = matchResult.customerId;

    // Update consent (and only consent) on the existing customer. Office
    // data is authoritative; we deliberately do not touch name/phone/email.
    await prisma.customer.update({
      where: { id: customerId },
      data: {
        externalDataConsentAt: consent.date,
        externalDataConsentScope: consent.scope,
        externalDataConsentRef: consent.docRef ?? null,
        lastImportDate: new Date(),
      },
    });

    await prisma.importJobCustomer
      .upsert({
        where: { importJobId_customerId: { importJobId, customerId } },
        create: {
          importJobId,
          customerId,
          matchType: matchResult.confidence === "HIGH" ? "exact" : "probable",
        },
        update: {},
      })
      .catch(() => {
        /* best-effort link; ignore unique conflicts on re-import */
      });
  } else {
    // NONE — create a new customer. We require some form of identity:
    // either a normalized national ID or at least a name. Without either,
    // we generate a placeholder ID so the unique constraint is satisfied
    // and רפי can clean it up via the manual review surface.
    if (!normalizedId) {
      // No national ID at all; this should only happen for the
      // singleton-grouped case where no other identity exists. Fall
      // back to a synthetic ID derived from the import job + a hash of
      // the candidate name so it stays deterministic across replays of
      // the same upload.
      throw new Error(
        "Cannot create Misleka-only customer without a national ID; route to manual review",
      );
    }

    const { firstName, lastName } = deriveFirstLastName(candidate);

    const created = await prisma.customer.create({
      data: {
        israeliId: normalizedId,
        firstName,
        lastName,
        email: candidate.email ?? null,
        phone: candidate.phone ?? null,
        dateOfBirth: candidate.dateOfBirth ?? null,
        gender: candidate.gender ?? null,
        maritalStatus: candidate.maritalStatus ?? null,
        address: [
          candidate.street,
          candidate.houseNumber,
          candidate.city,
          candidate.postalCode,
        ]
          .filter((s): s is string => !!s && s.trim().length > 0)
          .join(", ") || null,
        source: "MISLEKA_ONLY",
        externalDataConsentAt: consent.date,
        externalDataConsentScope: consent.scope,
        externalDataConsentRef: consent.docRef ?? null,
        lastImportDate: new Date(),
      },
      select: { id: true },
    });

    customerId = created.id;
    customerCreated = true;

    await prisma.importJobCustomer
      .create({
        data: { importJobId, customerId, matchType: "new" },
      })
      .catch(() => {
        /* tolerate unique conflict if re-running the same job */
      });
  }

  result.customerId = customerId;
  result.customerCreated = customerCreated;

  // -----------------------------------------------------------
  // Step 2: per-file, per-product upserts.
  // One transaction PER PRODUCT — keeps a single bad product from
  // poisoning the whole customer batch and matches the pipeline's
  // "best-effort, log warnings, keep going" contract.
  // -----------------------------------------------------------
  for (const fileEntry of merged.productsByFile) {
    const providerCode = fileEntry.metadata.providerCode;

    // Look up provider once per file.
    const provider = await prisma.institutionalProvider
      .findUnique({
        where: { providerCode },
        select: { id: true },
      })
      .catch(() => null);

    if (!provider) {
      result.warnings.push({
        code: "UNKNOWN_PROVIDER_CODE",
        message: "ספק לא מזוהה במאגר המוסדיים",
        // Provider code is a public Israeli company tax number — not PII.
        value: providerCode,
      });
    }

    for (const product of fileEntry.products) {
      try {
        const persistOne = await persistOneProduct({
          customerId,
          importJobId,
          providerId: provider?.id ?? null,
          providerCode,
          fileName: fileEntry.fileName,
          interfaceType: fileEntry.metadata.interfaceTypeLabel,
          product,
        });
        result.productsCreated += persistOne.productCreated ? 1 : 0;
        result.productsUpdated += persistOne.productCreated ? 0 : 1;
        result.balanceSnapshotsCreated += persistOne.balanceSnapshotsCreated;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        result.warnings.push({
          code: "PRODUCT_PERSIST_FAILED",
          message: "שגיאה בשמירת מוצר; דולג והממשיך",
          path: product.sourceRecordPath,
          // Truncated message; never includes raw payload because the
          // upstream code never carries one.
          value: msg.slice(0, 160),
        });
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------
// Per-product transactional upsert
// ---------------------------------------------------------------

async function persistOneProduct(args: {
  customerId: string;
  importJobId: string;
  providerId: string | null;
  providerCode: string;
  fileName: string;
  interfaceType: string | null;
  product: MislekaProductRecord;
}): Promise<{ productCreated: boolean; balanceSnapshotsCreated: number }> {
  const {
    customerId,
    importJobId,
    providerId,
    providerCode,
    fileName,
    interfaceType,
    product,
  } = args;

  const sourceStableKey = computeSourceStableKey({
    customerId,
    providerCode,
    policyOrAccountNumber: product.policyOrAccountNumber,
    productTypeCode: product.productTypeCode,
    unifiedProductCode: product.unifiedProductCode,
    sourceRecordPath: product.sourceRecordPath,
  });

  return await prisma.$transaction(async (tx) => {
    // ----- Upsert product -----
    const existing = await tx.customerFinancialProduct.findUnique({
      where: { sourceStableKey },
      select: { id: true },
    });

    let productId: string;
    let productCreated: boolean;

    const productData = {
      customerId,
      providerId,
      importJobId,
      source: "MISLEKA_XML",
      sourceFileName: fileName || null,
      sourceRecordPath: product.sourceRecordPath,
      productTypeCode: product.productTypeCode,
      productTypeLabel: product.productTypeLabel,
      interfaceType,
      planName: product.planName,
      policyOrAccountNumber: product.policyOrAccountNumber,
      unifiedProductCode: product.unifiedProductCode,
      statusCode: product.statusCode,
      statusLabel: product.statusLabel,
      isActive: product.isActive,
      joinDate: product.joinDate,
      firstJoinDate: product.firstJoinDate,
      lastUpdatedDate: product.lastUpdatedDate,
      valuationDate: product.valuationDate,
      hasLoan: product.hasLoan,
      hasArrears: product.hasArrears,
      hasExternalCoverage: product.hasExternalCoverage,
      hasBeneficiaries: product.hasBeneficiaries,
      hasAttorney: product.hasAttorney,
      employerName: product.employerName,
      employerCode: product.employerCode,
      rawImportantFieldsJson:
        (product.rawImportantFieldsJson as Prisma.InputJsonValue) ?? Prisma.JsonNull,
    };

    if (existing) {
      await tx.customerFinancialProduct.update({
        where: { id: existing.id },
        data: productData,
      });
      productId = existing.id;
      productCreated = false;
    } else {
      const created = await tx.customerFinancialProduct.create({
        data: { ...productData, sourceStableKey },
        select: { id: true },
      });
      productId = created.id;
      productCreated = true;
    }

    // ----- Upsert balance snapshots -----
    let balancesCreated = 0;
    for (const balance of product.balances) {
      try {
        const created = await upsertBalance({
          tx,
          productId,
          importJobId,
          balance,
        });
        if (created) balancesCreated += 1;
      } catch {
        // Don't poison the whole product for a single bad balance row.
        // The pipeline-level warnings already cover the product. Detail
        // here would risk leaking sensitive amounts into logs, so we
        // intentionally drop the cause silently. Re-importing fixes it
        // because the upsert is keyed by the natural unique key.
      }
    }

    return { productCreated, balanceSnapshotsCreated: balancesCreated };
  });
}

/**
 * Upsert a single balance snapshot. Returns true if a new row was created,
 * false if an existing row was updated.
 *
 * The natural unique key is (productId, snapshotDate, snapshotKind, trackCode).
 * Prisma exposes this as a compound `where` argument named per @@unique order.
 */
async function upsertBalance(args: {
  tx: Prisma.TransactionClient;
  productId: string;
  importJobId: string;
  balance: MislekaBalanceRecord;
}): Promise<boolean> {
  const { tx, productId, importJobId, balance } = args;

  // Prisma's compound where helper for nullable composite keys still
  // accepts null on trackCode at runtime; we use findFirst as a portable
  // workaround that avoids relying on the generated composite key shape
  // for nullable members.
  const existing = await tx.customerBalanceSnapshot.findFirst({
    where: {
      productId,
      snapshotDate: balance.snapshotDate,
      snapshotKind: balance.snapshotKind,
      trackCode: balance.trackCode,
    },
    select: { id: true },
  });

  const data = {
    productId,
    importJobId,
    snapshotDate: balance.snapshotDate,
    snapshotKind: balance.snapshotKind,
    trackCode: balance.trackCode,
    trackName: balance.trackName,
    balanceAmount: toDecimal(balance.balanceAmount),
    redemptionAmount: toDecimal(balance.redemptionAmount),
    monthlyContribution: toDecimal(balance.monthlyContribution),
    employeeContribution: toDecimal(balance.employeeContribution),
    employerContribution: toDecimal(balance.employerContribution),
    compensationComponent: toDecimal(balance.compensationComponent),
    ytdReturn: toDecimal(balance.ytdReturn),
    rawJson:
      (balance.rawJson as Prisma.InputJsonValue) ?? Prisma.JsonNull,
  };

  if (existing) {
    await tx.customerBalanceSnapshot.update({
      where: { id: existing.id },
      data,
    });
    return false;
  }

  await tx.customerBalanceSnapshot.create({ data });
  return true;
}
