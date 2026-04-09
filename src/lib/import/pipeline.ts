/**
 * Import Pipeline Orchestrator
 *
 * Coordinates the full import flow:
 * 1. Parse CSV files or accept pre-parsed rows
 * 2. Map columns to normalized records
 * 3. Merge customers across files by ת.ז.
 * 4. Persist to database
 * 5. Update import job status
 */

import { prisma } from "@/lib/db";
import { parseCsvBuffer } from "./parse-csv";
import { mapLifeRow } from "./column-maps/life-columns";
import { mapElementaryRow } from "./column-maps/elementary-columns";
import { normalizeLifeRow, normalizeElementaryRow, type NormalizedRecord } from "./normalizer";
import { mergeRecords } from "./merger";
import { batchPersistCustomers } from "./batch-persister";

// ============================================================
// Types
// ============================================================

export interface ImportFile {
  buffer: Buffer;
  fileName: string;
  fileType: "life" | "elementary";
}

export interface ImportRowBatch {
  fileName: string;
  headers: string[];
  rows: Record<string, string>[];
}

export interface PipelineResult {
  success: boolean;
  totalRowsParsed: number;
  totalCustomersMerged: number;
  newCustomers: number;
  updatedCustomers: number;
  failedCustomers: number;
  errors: Array<{ israeliId: string; error: string }>;
}

// ============================================================
// File type detection
// ============================================================

export function detectFileType(headers: string[]): "life" | "elementary" | "unknown" {
  const headerSet = new Set(headers.map((h) => h.trim()));

  if (headerSet.has("סוג מוצר פנסיוני") || headerSet.has("סה\"כ סכום חיסכון מצטבר")) {
    return "life";
  }

  if (headerSet.has("שם ענף") || headerSet.has("מס' רכב") || headerSet.has("סיום ביטוח")) {
    return "elementary";
  }

  return "unknown";
}

// ============================================================
// Pipeline from pre-parsed rows (used by the API route)
// ============================================================

export async function runImportPipelineFromRows(
  importJobId: string,
  batches: ImportRowBatch[]
): Promise<PipelineResult> {
  const allRecords: NormalizedRecord[] = [];
  let totalRowsParsed = 0;

  try {
    await prisma.importJob.update({
      where: { id: importJobId },
      data: { status: "PROCESSING" },
    });

    for (const batch of batches) {
      const fileType = detectFileType(batch.headers);
      totalRowsParsed += batch.rows.length;

      if (fileType === "life") {
        for (let i = 0; i < batch.rows.length; i++) {
          try {
            const mapped = mapLifeRow(batch.rows[i], i + 1);
            if (mapped.customer.israeliId) {
              allRecords.push(normalizeLifeRow(mapped, batch.fileName));
            }
          } catch {
            // Skip malformed rows
          }
        }
      } else if (fileType === "elementary") {
        for (let i = 0; i < batch.rows.length; i++) {
          try {
            const mapped = mapElementaryRow(batch.rows[i], i + 1);
            if (mapped.customer.israeliId) {
              allRecords.push(normalizeElementaryRow(mapped, batch.fileName));
            }
          } catch {
            // Skip malformed rows
          }
        }
      }
    }

    await prisma.importJob.update({
      where: { id: importJobId },
      data: { totalRows: totalRowsParsed },
    });

    const mergedCustomers = mergeRecords(allRecords);

    const persistResult = await batchPersistCustomers(
      mergedCustomers,
      importJobId
    );

    await prisma.importJob.update({
      where: { id: importJobId },
      data: {
        status: persistResult.failed > 0 ? "PARTIAL" : "COMPLETED",
        importedRows: mergedCustomers.length,
        newCustomers: persistResult.created,
        updatedCustomers: persistResult.updated,
        failedRows: persistResult.failed,
        errorLog: persistResult.errors.length > 0 ? persistResult.errors : undefined,
        completedAt: new Date(),
      },
    });

    return {
      success: true,
      totalRowsParsed,
      totalCustomersMerged: mergedCustomers.length,
      newCustomers: persistResult.created,
      updatedCustomers: persistResult.updated,
      failedCustomers: persistResult.failed,
      errors: persistResult.errors,
    };
  } catch (error) {
    await prisma.importJob.update({
      where: { id: importJobId },
      data: {
        status: "FAILED",
        errorLog: [{ error: error instanceof Error ? error.message : String(error) }],
        completedAt: new Date(),
      },
    });

    return {
      success: false,
      totalRowsParsed,
      totalCustomersMerged: 0,
      newCustomers: 0,
      updatedCustomers: 0,
      failedCustomers: 0,
      errors: [{ israeliId: "PIPELINE", error: error instanceof Error ? error.message : String(error) }],
    };
  }
}

// ============================================================
// Pipeline from raw buffers (for local/testing use)
// ============================================================

export async function runImportPipeline(
  importJobId: string,
  files: ImportFile[]
): Promise<PipelineResult> {
  const batches: ImportRowBatch[] = [];

  for (const file of files) {
    const parsed = parseCsvBuffer(file.buffer, "windows-1255");
    batches.push({
      fileName: file.fileName,
      headers: parsed.headers,
      rows: parsed.rows,
    });
  }

  return runImportPipelineFromRows(importJobId, batches);
}
