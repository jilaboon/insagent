/**
 * Merge per-file Misleka extractions into per-customer batches.
 *
 * One upload can carry many files (the Max Segal demo: 8 files from 5
 * providers, all for the same person). The persister works one customer at
 * a time, so we group by normalized national ID first.
 *
 * Files with no national ID get a fallback grouping by (fullName, dateOfBirth)
 * when both are present; otherwise each such file is its own group with no
 * candidate match information (the matcher will report NONE).
 *
 * Within a group:
 *   - Customer fields are unioned: first non-null value wins, never overwrite
 *     known data with a null. When two non-null values disagree, the file
 *     with the most recent metadata.executionDate wins, and a warning is
 *     emitted on the LOSING file's per-file warnings list.
 *   - Products are kept as a per-file list (no cross-file dedupe). We want
 *     full traceability per source — re-imports rely on the persister's
 *     sourceStableKey for idempotency, not on merge-time dedupe.
 */

import type {
  MislekaCustomerCandidate,
  MislekaFileExtraction,
  MislekaFileMetadata,
  MislekaProductRecord,
  MislekaWarning,
} from "./types";
import { normalizeIsraeliId } from "./matcher";

export interface MergedMislekaCustomerFile {
  fileName: string;
  metadata: MislekaFileMetadata;
  products: MislekaProductRecord[];
  warnings: MislekaWarning[];
}

export interface MergedMislekaCustomer {
  /** Best union of customer fields across all files in the group. */
  customer: MislekaCustomerCandidate;
  /** Per-file lists, preserved in input order. */
  productsByFile: MergedMislekaCustomerFile[];
}

// ---------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------

/**
 * Build the group key for a file. National ID is the primary key. When the
 * ID is null but we have both fullName and dateOfBirth, we synthesize a
 * "name-dob" key so the same person across name-only files still merges.
 * Otherwise each file is its own singleton group.
 */
function groupKey(
  ext: MislekaFileExtraction,
  index: number,
): { key: string; kind: "id" | "name-dob" | "singleton" } {
  const id = normalizeIsraeliId(
    ext.customer.israeliId ?? ext.customer.rawIsraeliId,
  );
  if (id) return { key: `id:${id}`, kind: "id" };

  const fullName =
    ext.customer.fullName?.trim() ||
    [ext.customer.firstName, ext.customer.lastName]
      .filter(Boolean)
      .join(" ")
      .trim();
  if (fullName && ext.customer.dateOfBirth) {
    const ymd = ext.customer.dateOfBirth.toISOString().slice(0, 10);
    return { key: `nd:${fullName}::${ymd}`, kind: "name-dob" };
  }

  // Singleton — synthesize a unique key so two identity-less files don't
  // accidentally merge.
  return { key: `s:${index}`, kind: "singleton" };
}

/**
 * Pick the better (newer) of two non-null values for a customer field. Used
 * when files disagree. Returns the value to keep and whether the loser
 * should be warned about.
 */
function pickByExecutionDate<T>(
  current: T,
  currentExec: Date | null,
  incoming: T,
  incomingExec: Date | null,
): { value: T; replaced: boolean } {
  // If we don't have both timestamps, prefer the value we already had
  // (stable on file order). The warning is still emitted because the values
  // differ.
  if (!currentExec || !incomingExec) {
    return { value: current, replaced: false };
  }
  if (incomingExec > currentExec) {
    return { value: incoming, replaced: true };
  }
  return { value: current, replaced: false };
}

/**
 * Merge a single field across two extractions. Returns the value to keep,
 * plus a warning to record on the losing file when there's a real conflict.
 */
type FieldKey = keyof MislekaCustomerCandidate;

function mergeField<K extends FieldKey>(
  field: K,
  current: MislekaCustomerCandidate[K],
  incoming: MislekaCustomerCandidate[K],
  currentExec: Date | null,
  incomingExec: Date | null,
): {
  value: MislekaCustomerCandidate[K];
  conflictWarning: MislekaWarning | null;
  loserIsIncoming: boolean;
} {
  // Never overwrite known data with null.
  if (incoming === null || incoming === undefined) {
    return {
      value: current,
      conflictWarning: null,
      loserIsIncoming: false,
    };
  }
  // First non-null wins when current is empty.
  if (current === null || current === undefined) {
    return {
      value: incoming,
      conflictWarning: null,
      loserIsIncoming: false,
    };
  }
  // Both non-null. Compare equality. Dates need value comparison.
  const equal =
    current instanceof Date && incoming instanceof Date
      ? current.getTime() === (incoming as Date).getTime()
      : current === incoming;
  if (equal) {
    return {
      value: current,
      conflictWarning: null,
      loserIsIncoming: false,
    };
  }

  // Real conflict.
  const picked = pickByExecutionDate(
    current,
    currentExec,
    incoming,
    incomingExec,
  );
  const warning: MislekaWarning = {
    code: "CUSTOMER_FIELD_CONFLICT",
    message: `שדה לקוח שונה בין קבצים: ${String(field)}`,
  };
  return {
    value: picked.value as MislekaCustomerCandidate[K],
    conflictWarning: warning,
    loserIsIncoming: !picked.replaced,
  };
}

/**
 * Apply mergeField across every field of MislekaCustomerCandidate.
 *
 * Returns the merged candidate, a list of warnings to attach to the current
 * (kept) file, and a list to attach to the incoming (newer / loser) file.
 */
function mergeCustomerCandidates(
  current: MislekaCustomerCandidate,
  currentExec: Date | null,
  incoming: MislekaCustomerCandidate,
  incomingExec: Date | null,
): {
  merged: MislekaCustomerCandidate;
  warningsForCurrent: MislekaWarning[];
  warningsForIncoming: MislekaWarning[];
} {
  const fields: FieldKey[] = [
    "israeliId",
    "rawIsraeliId",
    "firstName",
    "lastName",
    "fullName",
    "gender",
    "genderCode",
    "dateOfBirth",
    "maritalStatus",
    "maritalStatusCode",
    "email",
    "phone",
    "city",
    "street",
    "houseNumber",
    "postalCode",
  ];

  const merged: MislekaCustomerCandidate = { ...current };
  const warningsForCurrent: MislekaWarning[] = [];
  const warningsForIncoming: MislekaWarning[] = [];

  for (const f of fields) {
    const r = mergeField(
      f,
      current[f],
      incoming[f],
      currentExec,
      incomingExec,
    );
    // Type-safe: r.value is typed as MislekaCustomerCandidate[typeof f]
    (merged as Record<FieldKey, unknown>)[f] = r.value;
    if (r.conflictWarning) {
      if (r.loserIsIncoming) {
        warningsForIncoming.push(r.conflictWarning);
      } else {
        warningsForCurrent.push(r.conflictWarning);
      }
    }
  }

  return { merged, warningsForCurrent, warningsForIncoming };
}

// ---------------------------------------------------------------
// Public API
// ---------------------------------------------------------------

export function mergeFiles(
  extractions: MislekaFileExtraction[],
): MergedMislekaCustomer[] {
  // Track the merged customer plus the latest executionDate seen so far,
  // so that field-conflict resolution remains consistent across N files.
  interface GroupAccum {
    customer: MislekaCustomerCandidate;
    latestExec: Date | null;
    files: MergedMislekaCustomerFile[];
  }

  const groups = new Map<string, GroupAccum>();
  // Preserve first-seen group order in output.
  const order: string[] = [];

  for (let i = 0; i < extractions.length; i++) {
    const ext = extractions[i];
    const { key } = groupKey(ext, i);

    const fileEntry: MergedMislekaCustomerFile = {
      fileName: "", // filled in by the pipeline before persistence
      metadata: ext.metadata,
      products: ext.products,
      // Start with the parser-provided per-file warnings; merge conflicts
      // get appended below if any disagree.
      warnings: [...ext.warnings],
    };
    // The parser doesn't put fileName onto every warning, but the pipeline
    // tracks it via metadata. We borrow metadata's fileName placeholder
    // here — the pipeline replaces it before returning the report.
    // (Concretely, MislekaFileMetadata has providerCode/providerName but
    // not fileName, so the pipeline injects fileName when calling us.)

    let accum = groups.get(key);
    if (!accum) {
      accum = {
        customer: { ...ext.customer },
        latestExec: ext.metadata.executionDate ?? null,
        files: [fileEntry],
      };
      groups.set(key, accum);
      order.push(key);
      continue;
    }

    // Existing group — merge customer fields.
    const incomingExec = ext.metadata.executionDate ?? null;
    const { merged, warningsForCurrent, warningsForIncoming } =
      mergeCustomerCandidates(
        accum.customer,
        accum.latestExec,
        ext.customer,
        incomingExec,
      );
    accum.customer = merged;

    // Track latest execution date as we go.
    if (incomingExec && (!accum.latestExec || incomingExec > accum.latestExec)) {
      accum.latestExec = incomingExec;
    }

    // Conflict warnings on the kept side go onto the most recent file
    // we've already added to this group; loser warnings go on the incoming
    // file.
    if (warningsForCurrent.length > 0 && accum.files.length > 0) {
      const lastFile = accum.files[accum.files.length - 1];
      lastFile.warnings.push(...warningsForCurrent);
    }
    if (warningsForIncoming.length > 0) {
      fileEntry.warnings.push(...warningsForIncoming);
    }

    accum.files.push(fileEntry);
  }

  return order.map((k) => {
    const g = groups.get(k)!;
    return {
      customer: g.customer,
      productsByFile: g.files,
    };
  });
}
