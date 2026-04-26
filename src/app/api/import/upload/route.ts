import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { runImportPipelineFromRows } from "@/lib/import/pipeline";
import { detectFileType } from "@/lib/import/pipeline";
import { requireAuth, requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { importUploadSchema, validateBody } from "@/lib/validation";

export const maxDuration = 300;

/**
 * Accepts all pre-parsed CSV rows in one request.
 * Client parses the CSV in the browser, strips empty fields,
 * and sends the entire file as JSON.
 *
 * Body: { fileName, headers, rows[], jobId? }
 */
export async function POST(request: NextRequest) {
  const { response: authResponse, email, role } = await requireAuth();
  if (authResponse) return authResponse;

  const roleResponse = requireRole(role, ["OWNER", "MANAGER", "OPERATIONS", "ADMIN"]);
  if (roleResponse) return roleResponse;

  try {
    // Find or create the internal User record for the authenticated user
    const operator = await prisma.user.upsert({
      where: { email },
      create: {
        email,
        name: email.split("@")[0],
        role: role ?? "AGENT",
      },
      update: {},
    });

    const rawBody = await request.json();
    const validation = validateBody(importUploadSchema, rawBody);
    if (!validation.success) return validation.response;
    const {
      fileName,
      headers: rawHeaders,
      rows: rawRows,
      jobId: existingJobId,
    } = validation.data;

    // Empty cells arrive as null from the browser parser. Downstream
    // mappers expect string everywhere and already treat "" as no-value,
    // so coerce here once.
    const headers: string[] = rawHeaders.map((h) => h ?? "");
    const rows: Record<string, string>[] = rawRows.map((row) => {
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(row)) out[k] = v ?? "";
      return out;
    });

    // Create or reuse import job
    let jobId = existingJobId;
    if (!jobId) {
      const job = await prisma.importJob.create({
        data: {
          fileName: fileName || "unknown.csv",
          fileType: detectFileType(headers),
          status: "PROCESSING",
          operatorId: operator.id,
          totalRows: rows.length,
        },
      });
      jobId = job.id;
    } else {
      await prisma.importJob.update({
        where: { id: jobId },
        data: {
          totalRows: rows.length,
          fileName: fileName,
          status: "PROCESSING",
        },
      });
    }

    // Audit: import started
    await logAudit({
      actorEmail: email,
      action: "import_started",
      entityType: "import",
      entityId: jobId,
      details: { fileName, rowCount: rows.length },
    });

    // Run the full pipeline synchronously — with batch SQL this is fast
    const result = await runImportPipelineFromRows(jobId, [
      { fileName, headers, rows },
    ]);

    // Audit: import completed
    await logAudit({
      actorEmail: email,
      action: "import_completed",
      entityType: "import",
      entityId: jobId,
      details: {
        totalRows: result.totalRowsParsed,
        newCustomers: result.newCustomers,
        updatedCustomers: result.updatedCustomers,
        failed: result.failedCustomers,
      },
    });

    return NextResponse.json({
      jobId,
      success: result.success,
      totalRows: result.totalRowsParsed,
      customers: result.totalCustomersMerged,
      created: result.newCustomers,
      updated: result.updatedCustomers,
      failed: result.failedCustomers,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "שגיאה בעיבוד" },
      { status: 500 }
    );
  }
}
