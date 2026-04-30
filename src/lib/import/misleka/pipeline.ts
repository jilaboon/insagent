/**
 * Misleka import orchestrator.
 *
 * Wires:
 *   parse each file (Wave B's extractFromFile)
 *     → mergeFiles (group by national ID / name+DOB)
 *       → matchCustomer (HIGH / MEDIUM / LOW / NONE)
 *         → persistMergedCustomer (skip LOW)
 *           → aggregate report
 *
 * Status transitions:
 *   PROCESSING (set immediately)
 *     → COMPLETED      (no errors at all)
 *     → PARTIAL        (parse errors OR per-customer failures, but the
 *                       batch produced data)
 *     → FAILED         (raised before we wrote anything meaningful)
 *
 * Audit:
 *   misleka_import_started
 *   misleka_import_completed (always emitted on a clean / partial finish)
 *   misleka_import_failed    (only on hard failure)
 *   misleka_import_bypassed_consent (when bypassConsent + DEMO_INTERNAL)
 *
 * Audit details NEVER include national IDs, account numbers, balances, names,
 * phones, or raw XML — only counts, file names, and provider codes (the
 * latter is a public Israeli company tax number, not PII).
 */

import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import type {
  ConsentInput,
  MislekaFileExtraction,
  MislekaImportReport,
  MislekaImportReportFile,
  MislekaImportReportManualReview,
  MislekaWarning,
} from "./types";
import { mergeFiles, type MergedMislekaCustomer } from "./merger";
import { matchCustomer } from "./matcher";
import {
  persistMergedCustomer,
  type PersistConsent,
} from "./persister";
import { extractFromFile } from "./index";

// ---------------------------------------------------------------
// Public API
// ---------------------------------------------------------------

export interface RunMislekaImportParams {
  files: Array<{ fileName: string; buffer: Buffer }>;
  importJobId: string;
  operatorEmail: string;
  consent: ConsentInput;
}

export async function runMislekaImport(
  params: RunMislekaImportParams,
): Promise<MislekaImportReport> {
  const { files, importJobId, operatorEmail, consent } = params;
  const start = Date.now();

  // ----- Step 1: PROCESSING -----
  // Audit `misleka_import_started` and `misleka_import_bypassed_consent`
  // are emitted by the upload route, which has the authoritative operator
  // and request context. Re-emitting them here would double-count under
  // the route's call path. The pipeline is also runnable from scripts
  // (e.g. the sanity test); those scripts should emit their own start
  // audit if running outside the route.
  await prisma.importJob.update({
    where: { id: importJobId },
    data: { status: "PROCESSING" },
  });

  const report: MislekaImportReport = {
    importJobId,
    fileCount: files.length,
    filesProcessed: [],
    matchedCustomers: 0,
    newCustomers: 0,
    manualReviewQueue: [],
    productsCreated: 0,
    productsUpdated: 0,
    balanceSnapshotsCreated: 0,
    warnings: [],
    errors: [],
    durationMs: 0,
  };

  // Per-file metadata as it will be written into ImportJob.metadataJson.
  const metadataFiles: Array<{
    fileName: string;
    fileHash: string | null;
    providerCode: string | null;
    providerName: string | null;
    xmlVersion: string | null;
    interfaceType: string | null;
    productTypes: string[];
    executionDate: string | null;
    encoding: string | null;
    warnings: MislekaWarning[];
  }> = [];

  try {
    // ----- Step 2: parse every file; collect extractions or errors -----
    const extractions: Array<MislekaFileExtraction & { fileName: string }> = [];

    for (const f of files) {
      // Per-file SHA-256 for traceability; metadata-only, never includes
      // raw content. Computed in the pipeline so we don't depend on the
      // parser surfacing it through the public extraction type.
      const fileHash =
        "sha256:" + createHash("sha256").update(f.buffer).digest("hex");

      try {
        const ext = await extractFromFile(f.buffer, f.fileName);
        extractions.push({ ...ext, fileName: f.fileName });

        const fileEntry: MislekaImportReportFile = {
          fileName: f.fileName,
          providerCode: ext.metadata.providerCode,
          providerName: ext.metadata.providerName,
          productCount: ext.products.length,
          warningCount: ext.warnings.length,
        };
        report.filesProcessed.push(fileEntry);
        report.warnings.push(...ext.warnings);
        report.errors.push(...ext.errors);

        metadataFiles.push({
          fileName: f.fileName,
          fileHash,
          providerCode: ext.metadata.providerCode,
          providerName: ext.metadata.providerName,
          xmlVersion: ext.metadata.xmlVersion,
          interfaceType: ext.metadata.interfaceTypeLabel,
          productTypes: ext.metadata.productTypes,
          executionDate:
            ext.metadata.executionDate?.toISOString() ?? null,
          // Encoding isn't surfaced through MislekaFileExtraction; if a
          // future Wave promotes it we can read it here. For now the
          // parser already records it on MislekaParsedFile internally.
          encoding: null,
          warnings: ext.warnings,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // Truncated, non-PII message. The parser's own errors (Wave B) are
        // already Hebrew + safe; if a non-parser error slipped through,
        // we still cap the length.
        const safeMessage = msg.slice(0, 300);
        report.errors.push({
          code: "FILE_PARSE_FAILED",
          message: safeMessage,
        });
        // Still record the file in metadata so the post-mortem shows we
        // tried it.
        metadataFiles.push({
          fileName: f.fileName,
          fileHash,
          providerCode: null,
          providerName: null,
          xmlVersion: null,
          interfaceType: null,
          productTypes: [],
          executionDate: null,
          encoding: null,
          warnings: [{ code: "FILE_PARSE_FAILED", message: safeMessage }],
        });
      }
    }

    // ----- Step 3: merge by customer identity -----
    // mergeFiles takes the public MislekaFileExtraction shape and preserves
    // metadata object identity. After merging we walk the result and stamp
    // each file entry's fileName by mapping back through that identity —
    // the merger has no awareness of filenames and shouldn't.
    const merged: MergedMislekaCustomer[] = mergeFiles(extractions);

    const metaToFile = new Map<unknown, string>();
    for (const e of extractions) {
      metaToFile.set(e.metadata, e.fileName);
    }
    for (const m of merged) {
      for (const fe of m.productsByFile) {
        const fn = metaToFile.get(fe.metadata);
        if (fn) fe.fileName = fn;
      }
    }

    // ----- Step 4: per-customer match + persist -----
    const persistConsent: PersistConsent = {
      source: consent.source,
      scope: consent.scope,
      date: new Date(consent.date),
      recordedBy: consent.recordedBy,
      docRef: consent.docRef,
    };

    for (const m of merged) {
      try {
        const matchResult = await matchCustomer(m.customer);

        if (matchResult.confidence === "LOW") {
          // Hold for manual review — do not persist.
          // Identify which file(s) this group came from for the report.
          const fileNames = m.productsByFile
            .map((f) => f.fileName)
            .filter(Boolean);
          const review: MislekaImportReportManualReview = {
            fileName: fileNames[0] ?? "",
            candidateCustomerId: matchResult.candidateCustomerId ?? "",
            candidateCustomerName: matchResult.candidateCustomerName ?? "",
            confidence: matchResult.confidence,
            reason: matchResult.reason,
          };
          report.manualReviewQueue.push(review);
          continue;
        }

        const persistResult = await persistMergedCustomer({
          merged: m,
          matchResult,
          importJobId,
          consent: persistConsent,
        });

        if (persistResult.customerCreated) {
          report.newCustomers += 1;
        } else {
          report.matchedCustomers += 1;
        }
        report.productsCreated += persistResult.productsCreated;
        report.productsUpdated += persistResult.productsUpdated;
        report.balanceSnapshotsCreated += persistResult.balanceSnapshotsCreated;
        report.warnings.push(...persistResult.warnings);
      } catch (err) {
        // Per-customer failure: log + continue. Don't include any
        // customer-identifying detail in the message.
        const msg = err instanceof Error ? err.message : String(err);
        report.errors.push({
          code: "CUSTOMER_PERSIST_FAILED",
          message: msg.slice(0, 300),
        });
      }
    }

    // ----- Step 5: finalize ImportJob -----
    const hadErrors = report.errors.length > 0;
    const status: "COMPLETED" | "PARTIAL" = hadErrors ? "PARTIAL" : "COMPLETED";

    await prisma.importJob.update({
      where: { id: importJobId },
      data: {
        status,
        kind: "MISLEKA_XML",
        completedAt: new Date(),
        totalRows: files.length,
        importedRows: extractions.length,
        failedRows: files.length - extractions.length,
        newCustomers: report.newCustomers,
        updatedCustomers: report.matchedCustomers,
        ambiguousMatches: report.manualReviewQueue.length,
        metadataJson: { files: metadataFiles } as object,
        warnings:
          report.warnings.length > 0
            ? (report.warnings.slice(0, 200) as unknown as object)
            : undefined,
        errorLog:
          report.errors.length > 0
            ? (report.errors.slice(0, 50) as unknown as object)
            : undefined,
        consentSource: consent.source,
        consentScope: consent.scope,
        consentDate: new Date(consent.date),
        consentRecordedBy: consent.recordedBy,
        consentDocRef: consent.docRef ?? null,
      },
    });

    await logAudit({
      actorEmail: operatorEmail,
      action: "misleka_import_completed",
      entityType: "ImportJob",
      entityId: importJobId,
      details: {
        fileCount: files.length,
        matchedCustomers: report.matchedCustomers,
        newCustomers: report.newCustomers,
        manualReviewCount: report.manualReviewQueue.length,
        productsCreated: report.productsCreated,
        productsUpdated: report.productsUpdated,
        balanceSnapshotsCreated: report.balanceSnapshotsCreated,
        warningCount: report.warnings.length,
        errorCount: report.errors.length,
        status,
      },
    });

    report.durationMs = Date.now() - start;
    return report;
  } catch (err) {
    // Hard failure path: status FAILED, audit failed, rethrow.
    const msg = err instanceof Error ? err.message : String(err);
    const safeMessage = msg.slice(0, 500);

    await prisma.importJob
      .update({
        where: { id: importJobId },
        data: {
          status: "FAILED",
          completedAt: new Date(),
          metadataJson: { files: metadataFiles } as object,
          errorLog: [{ code: "PIPELINE_FAILED", message: safeMessage }] as unknown as object,
        },
      })
      .catch(() => {
        /* best-effort; audit will still record the failure */
      });

    await logAudit({
      actorEmail: operatorEmail,
      action: "misleka_import_failed",
      entityType: "ImportJob",
      entityId: importJobId,
      details: { error: safeMessage.slice(0, 200) },
    });

    throw err;
  }
}
