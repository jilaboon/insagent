import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { runImportPipeline, detectFileType, type ImportFile } from "@/lib/import/pipeline";
import { parseCsvBuffer } from "@/lib/import/parse-csv";

export const maxDuration = 300; // 5 minutes for large imports

// Temporary operator ID until auth is implemented
const TEMP_OPERATOR_ID = "system";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = formData.getAll("files") as File[];

    if (!files || files.length === 0) {
      return NextResponse.json({ error: "לא נבחרו קבצים" }, { status: 400 });
    }

    // Ensure system user exists for import jobs
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

    // Prepare files for pipeline
    const importFiles: ImportFile[] = [];

    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const parsed = parseCsvBuffer(buffer, "windows-1255");
      const fileType = detectFileType(parsed.headers);

      if (fileType === "unknown") {
        return NextResponse.json(
          { error: `לא ניתן לזהות את סוג הקובץ: ${file.name}` },
          { status: 400 }
        );
      }

      importFiles.push({
        buffer,
        fileName: file.name,
        fileType,
      });
    }

    // Create import job
    const job = await prisma.importJob.create({
      data: {
        fileName: files.map((f) => f.name).join(", "),
        fileType: importFiles.map((f) => f.fileType).join(", "),
        fileSize: importFiles.reduce((sum, f) => sum + f.buffer.length, 0),
        status: "PENDING",
        operatorId: TEMP_OPERATOR_ID,
      },
    });

    // Run pipeline (fire and forget — client polls for status)
    runImportPipeline(job.id, importFiles).catch((err) => {
      console.error("Import pipeline error:", err);
    });

    return NextResponse.json({
      jobId: job.id,
      message: "הייבוא החל",
      fileCount: files.length,
      fileTypes: importFiles.map((f) => f.fileType),
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: "שגיאה בהעלאת הקובץ" },
      { status: 500 }
    );
  }
}
