import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { runImportPipelineFromRows, type ImportRowBatch } from "@/lib/import/pipeline";

export const maxDuration = 300;

const TEMP_OPERATOR_ID = "system";

/**
 * Accepts pre-parsed CSV rows from the client as JSON.
 * The client reads the file, decodes Windows-1255, parses CSV,
 * and sends rows + headers in batches.
 *
 * Body: { fileName, headers: string[], rows: Record<string, string>[], fileType?: string }
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
      return NextResponse.json({ error: "לא נמצאו נתונים בקובץ" }, { status: 400 });
    }

    // Use existing job or create a new one
    let jobId = existingJobId;
    if (!jobId) {
      const job = await prisma.importJob.create({
        data: {
          fileName,
          fileType: "csv",
          status: "PENDING",
          operatorId: TEMP_OPERATOR_ID,
          totalRows: rows.length,
        },
      });
      jobId = job.id;
    } else {
      // Append to existing job's total rows
      const existing = await prisma.importJob.findUnique({ where: { id: jobId } });
      if (existing) {
        await prisma.importJob.update({
          where: { id: jobId },
          data: {
            totalRows: (existing.totalRows || 0) + rows.length,
            fileName: existing.fileName.includes(fileName)
              ? existing.fileName
              : `${existing.fileName}, ${fileName}`,
          },
        });
      }
    }

    const batch: ImportRowBatch = { fileName, headers, rows };

    // Run pipeline async
    runImportPipelineFromRows(jobId, [batch]).catch((err) => {
      console.error("Import pipeline error:", err);
    });

    return NextResponse.json({
      jobId,
      message: "הייבוא החל",
      rowCount: rows.length,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: "שגיאה בהעלאת הקובץ" },
      { status: 500 }
    );
  }
}
