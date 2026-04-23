import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/auth";
import { runHarHabituachImport } from "@/lib/import/har-habituach/pipeline";
import { HarHabituachParseError } from "@/lib/import/har-habituach/parse-xlsx";

export const maxDuration = 300;

// Hard limits — defensive. Real files observed at ~135KB; 10MB is plenty.
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIME_TYPES = new Set<string>([
  // xlsx (preferred format)
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  // xls (legacy)
  "application/vnd.ms-excel",
  // Some browsers send this for xlsx
  "application/octet-stream",
]);
const ALLOWED_EXTENSIONS = [".xlsx", ".xls"];

/**
 * POST /api/import/har-habituach/upload
 *
 * Accepts a Har HaBituach "פוטנציאלים" xlsx file as multipart/form-data,
 * parses server-side (not client-side — the file is binary xlsx), merges
 * with the existing customer database, and returns a summary.
 *
 * Security:
 * - requireAuth: signed-in user only
 * - requireRole: OWNER/MANAGER/OPERATIONS/ADMIN only (AGENT blocked)
 * - 10MB file cap enforced BEFORE parsing
 * - MIME + extension check
 * - logAudit: start/complete/fail events
 * - Errors returned to the client are sanitized (no file paths or PII)
 */
export async function POST(request: NextRequest) {
  const { response: authResponse, email, role } = await requireAuth();
  if (authResponse) return authResponse;

  const roleResponse = requireRole(role, [
    "OWNER",
    "MANAGER",
    "OPERATIONS",
    "ADMIN",
  ]);
  if (roleResponse) return roleResponse;

  // Parse multipart form
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "לא ניתן לקרוא את גוף הבקשה" },
      { status: 400 }
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "לא צורף קובץ" },
      { status: 400 }
    );
  }

  // Size cap (pre-parse)
  if (file.size === 0) {
    return NextResponse.json({ error: "הקובץ ריק" }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json(
      {
        error: `הקובץ גדול מדי (מעל ${Math.round(
          MAX_FILE_SIZE_BYTES / 1024 / 1024
        )}MB)`,
      },
      { status: 413 }
    );
  }

  // MIME + extension validation
  // Require a valid extension. If MIME is also present, it must be in the
  // allowed set — unless MIME is empty (some browsers strip it, acceptable).
  // This is stricter than checking "extension OR MIME" — a binary named
  // evil.exe with MIME application/octet-stream previously slipped through.
  const fileName = (file.name || "").toLowerCase();
  const hasAllowedExt = ALLOWED_EXTENSIONS.some((ext) =>
    fileName.endsWith(ext)
  );
  const hasBadMime = !!file.type && !ALLOWED_MIME_TYPES.has(file.type);
  if (!hasAllowedExt || hasBadMime) {
    return NextResponse.json(
      { error: "סוג קובץ לא נתמך. יש להעלות xlsx או xls." },
      { status: 415 }
    );
  }

  // Find/create operator User record
  const operator = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      name: email.split("@")[0],
      role: role ?? "AGENT",
    },
    update: {},
  });

  // In-flight import lock: refuse to start a new import if this operator
  // already has a PROCESSING job. Prevents accidental double-uploads,
  // runaway concurrent imports that exhaust DB connections, and a trivial
  // DoS vector from a single authenticated user.
  const inFlight = await prisma.importJob.findFirst({
    where: { operatorId: operator.id, status: "PROCESSING" },
    select: { id: true, fileName: true, createdAt: true },
  });
  if (inFlight) {
    return NextResponse.json(
      {
        error: "ייבוא קודם עדיין בעיבוד",
        detail: `קובץ ${inFlight.fileName} נטען כרגע. יש להמתין לסיום לפני העלאת קובץ נוסף.`,
      },
      { status: 409 }
    );
  }

  // Run the pipeline
  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const result = await runHarHabituachImport({
      buffer,
      fileName: file.name || "har-habituach.xlsx",
      fileSize: file.size,
      operatorId: operator.id,
      operatorEmail: email,
    });

    return NextResponse.json({
      success: true,
      importJobId: result.importJobId,
      totalRows: result.totalRows,
      validRows: result.validRows,
      skippedRows: result.skippedRows,
      customersExisting: result.customersExisting,
      customersCreated: result.customersCreated,
      policiesMatched: result.policiesMatched,
      policiesCreated: result.policiesCreated,
      errorCount: result.errors.length,
    });
  } catch (err) {
    // Known parse errors carry safe, user-facing Hebrew messages.
    // Anything else gets a generic error with no PII/path leakage.
    if (err instanceof HarHabituachParseError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    // Don't expose raw error messages — they can include Prisma constraint
    // names, table names, or field values. In non-prod we surface a short
    // detail for debugging; in production we return a generic message only.
    const body: Record<string, string> = { error: "הייבוא נכשל" };
    if (process.env.NODE_ENV !== "production") {
      const fallback =
        err instanceof Error ? err.message : "אירעה שגיאה בלתי צפויה";
      body.detail = fallback.slice(0, 120);
    }
    return NextResponse.json(body, { status: 500 });
  }
}
