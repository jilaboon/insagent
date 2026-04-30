import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { mislekaUploadSchema } from "@/lib/validation";
import { runMislekaImport } from "@/lib/import/misleka/pipeline";
import {
  MislekaParseError,
  MislekaSecurityError,
} from "@/lib/import/misleka/errors";
import type {
  ConsentScope,
  ConsentSource,
  MislekaImportReport,
} from "@/lib/import/misleka/types";

// Misleka pipeline runs many file parses + DB writes; allow up to 5 minutes.
export const maxDuration = 300;

// File-level limits — defensive caps. Real Misleka files are tens-to-hundreds
// of KB. We're permissive enough for outliers but never enough for abuse.
const MAX_FILES_PER_UPLOAD = 20;
const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB per file
const MAX_TOTAL_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB across all files

const ALLOWED_EXTENSIONS = [".xml"];
const ALLOWED_MIME_TYPES = new Set<string>([
  "application/xml",
  "text/xml",
  "application/octet-stream",
  "",
]);

/**
 * Sanitize a filename for logging — strip path components, control chars,
 * and trim length. Filenames themselves can carry references like national
 * IDs in some agencies' export naming, so we still keep them only at the
 * structured-log level (never in error messages).
 */
function sanitizeFileName(raw: string): string {
  const noPath = raw.split(/[/\\]/).pop() || "file.xml";
  const stripped = noPath.replace(/[\x00-\x1f\x7f]/g, "");
  return stripped.slice(0, 255);
}

/**
 * POST /api/import/misleka/upload
 *
 * Accepts up to 20 Misleka XML files in a single multipart/form-data upload
 * along with a captured consent decision. Hands them to the Misleka pipeline
 * which parses, matches the customer, persists CustomerFinancialProduct +
 * CustomerBalanceSnapshot rows, and returns a structured import report.
 *
 * Security:
 * - requireAuth + requireRole(OWNER/MANAGER/OPERATIONS/ADMIN); AGENT blocked.
 * - File count cap, per-file size cap, total-batch size cap, extension +
 *   MIME validation. All caps applied BEFORE buffers are read.
 * - Consent is mandatory. DEMO_INTERNAL bypass is OWNER-only and audited.
 * - Per-operator in-flight lock prevents accidental double-uploads.
 * - Audit events: started / completed / failed / bypassed_consent.
 * - File buffers and XML content are never logged. Only counts, sanitized
 *   filenames, and consent metadata go to audit details.
 */
export async function POST(request: NextRequest) {
  // ---- 1. Auth ------------------------------------------------------------
  const { response: authResponse, email, role, userId } = await requireAuth();
  if (authResponse) return authResponse;

  const roleResponse = requireRole(role, [
    "OWNER",
    "MANAGER",
    "OPERATIONS",
    "ADMIN",
  ]);
  if (roleResponse) return roleResponse;

  // ---- 2. Parse multipart body -------------------------------------------
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "לא ניתן לקרוא את גוף הבקשה" },
      { status: 400 }
    );
  }

  // Pull files first — we need to enforce the count cap before we read any
  // buffer (per design §8 — count cap precedes buffer reads).
  const fileEntries = form.getAll("file").filter((f): f is File => f instanceof File);

  if (fileEntries.length === 0) {
    return NextResponse.json(
      { error: "לא צורפו קבצים לייבוא" },
      { status: 400 }
    );
  }

  if (fileEntries.length > MAX_FILES_PER_UPLOAD) {
    return NextResponse.json(
      {
        error: `ניתן להעלות עד ${MAX_FILES_PER_UPLOAD} קבצים בפעולה אחת`,
      },
      { status: 400 }
    );
  }

  // ---- 3. Validate consent fields via Zod --------------------------------
  const rawConsent = {
    customerId: (form.get("customerId") as string | null) || undefined,
    consentSource: form.get("consentSource") as string | null,
    consentScope: form.get("consentScope") as string | null,
    consentDate: form.get("consentDate") as string | null,
    consentDocRef: (form.get("consentDocRef") as string | null) || undefined,
    bypassConsent:
      (form.get("bypassConsent") as string | null) === "true" || undefined,
  };

  const parsed = mislekaUploadSchema.safeParse(rawConsent);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          "חסר אישור הסכמה לאחסון נתונים פיננסיים — יש לציין מקור הסכמה, היקף, ותאריך.",
      },
      { status: 400 }
    );
  }
  const consent = parsed.data;

  // ---- 4. Demo-bypass enforcement ----------------------------------------
  // DEMO_INTERNAL scope is allowed only when bypassConsent === true AND
  // role === OWNER. Any other combination is a hard 403.
  if (consent.consentScope === "DEMO_INTERNAL") {
    if (consent.bypassConsent !== true || role !== "OWNER") {
      return NextResponse.json(
        {
          error: "אישור עוקף נדרש להעלאת נתוני דמו — תפקיד OWNER בלבד.",
        },
        { status: 403 }
      );
    }
  } else if (consent.bypassConsent === true) {
    // bypassConsent only makes sense with DEMO_INTERNAL — reject the
    // mismatch rather than silently ignoring it.
    return NextResponse.json(
      {
        error: "אישור עוקף תקף רק בהיקף הסכמה DEMO_INTERNAL.",
      },
      { status: 400 }
    );
  }

  // ---- 5. Validate each file (extension, MIME, size) ---------------------
  let totalSize = 0;
  for (const f of fileEntries) {
    const safeName = sanitizeFileName(f.name || "");
    const lowerName = safeName.toLowerCase();

    if (f.size === 0) {
      return NextResponse.json(
        { error: "אחד הקבצים ריק" },
        { status: 400 }
      );
    }

    if (f.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        {
          error: `קובץ גדול מדי (מעל ${Math.round(
            MAX_FILE_SIZE_BYTES / 1024 / 1024
          )}MB)`,
        },
        { status: 413 }
      );
    }

    const hasAllowedExt = ALLOWED_EXTENSIONS.some((ext) =>
      lowerName.endsWith(ext)
    );
    const mime = (f.type || "").toLowerCase();
    const hasAllowedMime = ALLOWED_MIME_TYPES.has(mime);

    if (!hasAllowedExt || !hasAllowedMime) {
      return NextResponse.json(
        { error: "סוג קובץ לא נתמך — נדרש קובץ XML של מסלקה" },
        { status: 415 }
      );
    }

    totalSize += f.size;
  }

  if (totalSize > MAX_TOTAL_SIZE_BYTES) {
    return NextResponse.json(
      {
        error: `גודל הקבצים הכולל חורג מ-${Math.round(
          MAX_TOTAL_SIZE_BYTES / 1024 / 1024
        )}MB`,
      },
      { status: 413 }
    );
  }

  // ---- 6. Resolve operator User row --------------------------------------
  // requireAuth() already upserts and returns userId, but we re-upsert to
  // mirror the BAFI/Har HaBituach pattern and stay defensive against any
  // race that nuked the record between requests.
  const operator = userId
    ? await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, role: true },
      })
    : null;

  const operatorRow =
    operator ??
    (await prisma.user.upsert({
      where: { email },
      create: {
        email,
        name: email.split("@")[0],
        role: role ?? "AGENT",
      },
      update: {},
      select: { id: true, email: true, role: true },
    }));

  // ---- 7. In-flight lock --------------------------------------------------
  const inFlight = await prisma.importJob.findFirst({
    where: {
      operatorId: operatorRow.id,
      status: "PROCESSING",
      kind: "MISLEKA_XML",
    },
    select: { id: true, fileName: true, createdAt: true },
  });
  if (inFlight) {
    return NextResponse.json(
      {
        error: "ייבוא מסלקה קודם עדיין בעיבוד",
        detail: `קובץ ${inFlight.fileName} בעיבוד כרגע. יש להמתין לסיום לפני העלאת קבצים נוספים.`,
      },
      { status: 409 }
    );
  }

  // ---- 8. Snapshot file metadata for the ImportJob -----------------------
  // We avoid reading the buffers into the job row; only safe scalars go in.
  const fileMetaForJob = fileEntries.map((f) => ({
    fileName: sanitizeFileName(f.name || "file.xml"),
    fileSize: f.size,
  }));
  const primaryFileName = fileMetaForJob[0]?.fileName ?? "misleka.xml";

  // ---- 9. Create ImportJob (PROCESSING) ----------------------------------
  let job;
  try {
    job = await prisma.importJob.create({
      data: {
        fileName: primaryFileName,
        fileType: "misleka_xml", // legacy compat
        kind: "MISLEKA_XML",
        fileSize: totalSize,
        status: "PROCESSING",
        operatorId: operatorRow.id,
        consentSource: consent.consentSource,
        consentScope: consent.consentScope,
        consentDate: new Date(consent.consentDate),
        consentRecordedBy: email,
        consentDocRef: consent.consentDocRef ?? null,
        // Per-file detail captured here per design §3.1. The pipeline will
        // enrich this with provider/version/encoding once it parses.
        metadataJson: {
          files: fileMetaForJob,
          uploadedAt: new Date().toISOString(),
          customerHint: consent.customerId ?? null,
        },
      },
      select: { id: true },
    });
  } catch (err) {
    console.error("Failed to create Misleka ImportJob:", err);
    return NextResponse.json(
      { error: "יצירת משימת הייבוא נכשלה" },
      { status: 500 }
    );
  }

  // ---- 10. Audit: import started -----------------------------------------
  await logAudit({
    actorEmail: email,
    action: "misleka_import_started",
    entityType: "ImportJob",
    entityId: job.id,
    details: {
      fileCount: fileEntries.length,
      totalSize,
      consentScope: consent.consentScope,
      consentSource: consent.consentSource,
    },
  });

  // Separate audit for the demo-bypass path (per design §8.5).
  if (consent.bypassConsent === true) {
    await logAudit({
      actorEmail: email,
      action: "misleka_import_bypassed_consent",
      entityType: "ImportJob",
      entityId: job.id,
      details: {
        fileCount: fileEntries.length,
        consentScope: consent.consentScope,
      },
    });
  }

  // ---- 11. Read buffers + run pipeline -----------------------------------
  let report: MislekaImportReport;
  try {
    const filesForPipeline = await Promise.all(
      fileEntries.map(async (f) => ({
        fileName: sanitizeFileName(f.name || "misleka.xml"),
        buffer: Buffer.from(await f.arrayBuffer()),
      }))
    );

    report = await runMislekaImport({
      files: filesForPipeline,
      importJobId: job.id,
      operatorEmail: email,
      consent: {
        source: consent.consentSource as ConsentSource,
        scope: consent.consentScope as ConsentScope,
        date: consent.consentDate,
        recordedBy: email,
        docRef: consent.consentDocRef,
        bypassConsent: consent.bypassConsent,
      },
    });
  } catch (err) {
    // Mark job FAILED. Pipeline errors must not leave a PROCESSING row
    // hanging — that would hold the in-flight lock indefinitely.
    try {
      await prisma.importJob.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          completedAt: new Date(),
          errorLog: {
            code:
              err instanceof MislekaSecurityError
                ? "SECURITY_REJECTED"
                : err instanceof MislekaParseError
                  ? "PARSE_ERROR"
                  : "PIPELINE_ERROR",
            // Note: Hebrew messages from our own error classes are safe.
            // For unknown errors we record only the class name, never the
            // message (it can carry XML fragments / library internals).
            message:
              err instanceof MislekaParseError ||
              err instanceof MislekaSecurityError
                ? err.message
                : err instanceof Error
                  ? err.name
                  : "UNKNOWN",
          },
        },
      });
    } catch (updateErr) {
      console.error("Failed to mark Misleka job FAILED:", updateErr);
    }

    await logAudit({
      actorEmail: email,
      action: "misleka_import_failed",
      entityType: "ImportJob",
      entityId: job.id,
      details: {
        fileCount: fileEntries.length,
        errorClass:
          err instanceof Error ? err.name : "UnknownError",
      },
    });

    if (err instanceof MislekaParseError || err instanceof MislekaSecurityError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }

    const body: Record<string, string> = { error: "ייבוא המסלקה נכשל" };
    if (process.env.NODE_ENV !== "production") {
      const fallback = err instanceof Error ? err.message : "אירעה שגיאה בלתי צפויה";
      body.detail = fallback.slice(0, 120);
    }
    return NextResponse.json(body, { status: 500 });
  }

  // ---- 12. Audit: import completed ---------------------------------------
  // Counts only — never balances, names, IDs, or file content.
  await logAudit({
    actorEmail: email,
    action: "misleka_import_completed",
    entityType: "ImportJob",
    entityId: job.id,
    details: {
      fileCount: report.fileCount,
      matchedCustomers: report.matchedCustomers,
      newCustomers: report.newCustomers,
      productsCreated: report.productsCreated,
      productsUpdated: report.productsUpdated,
      balanceSnapshotsCreated: report.balanceSnapshotsCreated,
      manualReviewCount: report.manualReviewQueue.length,
      warningCount: report.warnings.length,
      errorCount: report.errors.length,
      durationMs: report.durationMs,
    },
  });

  return NextResponse.json(report);
}
