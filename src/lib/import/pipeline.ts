/**
 * Import Pipeline Orchestrator
 *
 * Coordinates the full import flow:
 * 1. Parse CSV files (Windows-1255 → UTF-8)
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
import { persistMergedCustomers } from "./persister";

// ============================================================
// Types
// ============================================================

export interface ImportFile {
  buffer: Buffer;
  fileName: string;
  fileType: "life" | "elementary";
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

/**
 * Detect whether a CSV file is life or elementary based on header columns.
 */
export function detectFileType(headers: string[]): "life" | "elementary" | "unknown" {
  const headerSet = new Set(headers.map((h) => h.trim()));

  // Life CSV has these unique columns
  if (headerSet.has("סוג מוצר פנסיוני") || headerSet.has("סה\"כ סכום חיסכון מצטבר")) {
    return "life";
  }

  // Elementary CSV has these unique columns
  if (headerSet.has("שם ענף") || headerSet.has("מס' רכב") || headerSet.has("סיום ביטוח")) {
    return "elementary";
  }

  return "unknown";
}

// ============================================================
// Pipeline
// ============================================================

export async function runImportPipeline(
  importJobId: string,
  files: ImportFile[]
): Promise<PipelineResult> {
  const allRecords: NormalizedRecord[] = [];
  let totalRowsParsed = 0;

  try {
    // Update job status to PROCESSING
    await prisma.importJob.update({
      where: { id: importJobId },
      data: { status: "PROCESSING" },
    });

    // Phase 1: Parse and normalize all files
    for (const file of files) {
      const parsed = parseCsvBuffer(file.buffer, "windows-1255");
      totalRowsParsed += parsed.totalRows;

      // Auto-detect file type if needed
      const fileType = file.fileType || detectFileType(parsed.headers);

      if (fileType === "life") {
        for (let i = 0; i < parsed.rows.length; i++) {
          try {
            const mapped = mapLifeRow(parsed.rows[i], i + 1);
            if (mapped.customer.israeliId) {
              allRecords.push(normalizeLifeRow(mapped, file.fileName));
            }
          } catch {
            // Skip malformed rows silently
          }
        }
      } else if (fileType === "elementary") {
        for (let i = 0; i < parsed.rows.length; i++) {
          try {
            const mapped = mapElementaryRow(parsed.rows[i], i + 1);
            if (mapped.customer.israeliId) {
              allRecords.push(normalizeElementaryRow(mapped, file.fileName));
            }
          } catch {
            // Skip malformed rows silently
          }
        }
      }
    }

    // Update total rows
    await prisma.importJob.update({
      where: { id: importJobId },
      data: { totalRows: totalRowsParsed },
    });

    // Phase 2: Merge customers across files
    const mergedCustomers = mergeRecords(allRecords);

    // Phase 3: Persist to database
    const persistResult = await persistMergedCustomers(
      mergedCustomers,
      importJobId,
      async (progress) => {
        // Update import job with progress
        await prisma.importJob.update({
          where: { id: importJobId },
          data: {
            importedRows: progress.processed,
            newCustomers: progress.created,
            updatedCustomers: progress.updated,
            failedRows: progress.failed,
          },
        });
      }
    );

    // Phase 4: Complete
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
    // Mark job as failed
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
