/**
 * Har HaBituach import orchestrator.
 * Wires: parse-xlsx → normalize rows → merge by ת.ז. → persist.
 * Returns a counter summary suitable for the ImportJob record + UI.
 */

import { prisma } from "@/lib/db";
import { parseHarHabituachBuffer, HarHabituachParseError } from "./parse-xlsx";
import { mapHarHabituachRow } from "./columns";
import { mergeHarHabituachRows } from "./merger";
import { persistHarHabituach } from "./persister";
import { logAudit } from "@/lib/audit";

export interface RunResult {
  importJobId: string;
  totalRows: number;
  validRows: number;
  skippedRows: number;
  customersExisting: number;
  customersCreated: number;
  policiesMatched: number;
  policiesCreated: number;
  errors: Array<{ israeliId: string; error: string }>;
}

export async function runHarHabituachImport(opts: {
  buffer: Buffer;
  fileName: string;
  fileSize: number;
  operatorId: string;
  operatorEmail: string;
}): Promise<RunResult> {
  const { buffer, fileName, fileSize, operatorId, operatorEmail } = opts;

  // 1) Create ImportJob (PROCESSING)
  const job = await prisma.importJob.create({
    data: {
      fileName,
      fileType: "har_habituach",
      fileSize,
      status: "PROCESSING",
      operatorId,
    },
  });

  await logAudit({
    actorEmail: operatorEmail,
    action: "har_habituach_import_started",
    entityType: "ImportJob",
    entityId: job.id,
    details: { fileName, fileSize },
  });

  try {
    // 2) Parse buffer
    const parsed = parseHarHabituachBuffer(buffer);
    const totalRows = parsed.rows.length;

    // 3) Normalize rows
    const normalized = [];
    let skippedRows = 0;
    for (let i = 0; i < parsed.rows.length; i++) {
      const mapped = mapHarHabituachRow(parsed.rows[i], i);
      if (mapped) normalized.push(mapped);
      else skippedRows += 1;
    }

    // 4) Merge by israeliId
    const merged = mergeHarHabituachRows(normalized);

    // 5) Persist
    const persistResult = await persistHarHabituach(merged, job.id);

    // 6) Mark job COMPLETED / PARTIAL
    const status =
      persistResult.errors.length === 0 ? "COMPLETED" : "PARTIAL";

    await prisma.importJob.update({
      where: { id: job.id },
      data: {
        status,
        totalRows,
        importedRows: normalized.length,
        failedRows: skippedRows + persistResult.errors.length,
        newCustomers: persistResult.customersCreated,
        updatedCustomers: persistResult.customersExisting,
        errorLog:
          persistResult.errors.length > 0
            ? (persistResult.errors.slice(0, 50) as unknown as object)
            : undefined,
        completedAt: new Date(),
      },
    });

    await logAudit({
      actorEmail: operatorEmail,
      action: "har_habituach_import_completed",
      entityType: "ImportJob",
      entityId: job.id,
      details: {
        totalRows,
        validRows: normalized.length,
        skippedRows,
        customersExisting: persistResult.customersExisting,
        customersCreated: persistResult.customersCreated,
        policiesMatched: persistResult.policiesMatched,
        policiesCreated: persistResult.policiesCreated,
        errorCount: persistResult.errors.length,
      },
    });

    return {
      importJobId: job.id,
      totalRows,
      validRows: normalized.length,
      skippedRows,
      customersExisting: persistResult.customersExisting,
      customersCreated: persistResult.customersCreated,
      policiesMatched: persistResult.policiesMatched,
      policiesCreated: persistResult.policiesCreated,
      errors: persistResult.errors,
    };
  } catch (err) {
    const errorMessage =
      err instanceof HarHabituachParseError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Unknown error";

    await prisma.importJob.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        errorLog: [{ error: errorMessage.slice(0, 500) }] as unknown as object,
      },
    });

    await logAudit({
      actorEmail: operatorEmail,
      action: "har_habituach_import_failed",
      entityType: "ImportJob",
      entityId: job.id,
      details: { error: errorMessage.slice(0, 200) },
    });

    throw err;
  }
}
