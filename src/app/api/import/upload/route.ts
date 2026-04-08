import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { detectFileType } from "@/lib/import/pipeline";
import { mapLifeRow } from "@/lib/import/column-maps/life-columns";
import { mapElementaryRow } from "@/lib/import/column-maps/elementary-columns";
import { normalizeLifeRow, normalizeElementaryRow } from "@/lib/import/normalizer";
import { mergeRecords } from "@/lib/import/merger";
import { persistMergedCustomers } from "@/lib/import/persister";

export const maxDuration = 300;

const TEMP_OPERATOR_ID = "system";

/**
 * Processes a chunk of CSV rows synchronously.
 * Each chunk: parse → normalize → merge → persist → return.
 * The client sends chunks sequentially and tracks progress.
 *
 * Body: { fileName, headers, rows, jobId? }
 * Returns: { jobId, processed, created, updated, failed }
 */
export async function POST(request: NextRequest) {
  try {
    await prisma.user.upsert({
      where: { id: TEMP_OPERATOR_ID },
      create: {
        id: TEMP_OPERATOR_ID,
        email: "system@insagent.local",
        name: "מערכת",
        role: "ADMIN",
      },
      update: {},
    });

    const body = await request.json();
    const { fileName, headers, rows, jobId: existingJobId } = body as {
      fileName: string;
      headers: string[];
      rows: Record<string, string>[];
      jobId?: string;
    };

    if (!headers || !rows || rows.length === 0) {
      return NextResponse.json({ error: "לא נמצאו נתונים" }, { status: 400 });
    }

    // Create or get import job
    let jobId = existingJobId;
    if (!jobId) {
      const job = await prisma.importJob.create({
        data: {
          fileName: fileName || "unknown.csv",
          fileType: detectFileType(headers),
          status: "PROCESSING",
          operatorId: TEMP_OPERATOR_ID,
          totalRows: 0,
          importedRows: 0,
          newCustomers: 0,
          updatedCustomers: 0,
          failedRows: 0,
        },
      });
      jobId = job.id;
    }

    // Normalize rows
    const fileType = detectFileType(headers);
    const normalizedRecords = [];

    for (let i = 0; i < rows.length; i++) {
      try {
        if (fileType === "life") {
          const mapped = mapLifeRow(rows[i], i + 1);
          if (mapped.customer.israeliId) {
            normalizedRecords.push(normalizeLifeRow(mapped, fileName));
          }
        } else if (fileType === "elementary") {
          const mapped = mapElementaryRow(rows[i], i + 1);
          if (mapped.customer.israeliId) {
            normalizedRecords.push(normalizeElementaryRow(mapped, fileName));
          }
        }
      } catch {
        // Skip malformed rows
      }
    }

    // Merge and persist this chunk
    const merged = mergeRecords(normalizedRecords);
    const result = await persistMergedCustomers(merged, jobId);

    // Update job totals (increment)
    const currentJob = await prisma.importJob.findUnique({ where: { id: jobId } });
    await prisma.importJob.update({
      where: { id: jobId },
      data: {
        totalRows: (currentJob?.totalRows || 0) + rows.length,
        importedRows: (currentJob?.importedRows || 0) + merged.length,
        newCustomers: (currentJob?.newCustomers || 0) + result.created,
        updatedCustomers: (currentJob?.updatedCustomers || 0) + result.updated,
        failedRows: (currentJob?.failedRows || 0) + result.failed,
        fileName: currentJob?.fileName?.includes(fileName)
          ? currentJob.fileName
          : `${currentJob?.fileName || ""}, ${fileName}`.replace(/^, /, ""),
      },
    });

    return NextResponse.json({
      jobId,
      processed: merged.length,
      created: result.created,
      updated: result.updated,
      failed: result.failed,
    });
  } catch (error) {
    console.error("Upload/process error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "שגיאה בעיבוד" },
      { status: 500 }
    );
  }
}
