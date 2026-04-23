import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

/**
 * PATCH  /api/customers/[id]/notes/[noteId]  — edit body of an existing note
 * DELETE /api/customers/[id]/notes/[noteId]  — remove a note
 *
 * Authorization:
 * - An agent can only edit/delete notes they authored themselves.
 * - OWNER / MANAGER / ADMIN can edit or delete any note.
 */

const updateSchema = z.object({
  body: z.string().trim().min(1, "לא ניתן לשמור עדכון ריק").max(4000),
});

const ELEVATED_ROLES = new Set(["OWNER", "MANAGER", "ADMIN"]);

async function loadNoteAndAuthorize(
  noteId: string,
  customerId: string,
  email: string,
  role: string | null
): Promise<
  | { ok: true; note: { id: string; authorEmail: string | null } }
  | { ok: false; response: NextResponse }
> {
  const note = await prisma.customerNote.findUnique({
    where: { id: noteId },
    select: {
      id: true,
      customerId: true,
      author: { select: { email: true } },
    },
  });

  if (!note || note.customerId !== customerId) {
    return {
      ok: false,
      response: NextResponse.json({ error: "עדכון לא נמצא" }, { status: 404 }),
    };
  }

  const isOwner = note.author?.email === email;
  const isElevated = role != null && ELEVATED_ROLES.has(role);
  if (!isOwner && !isElevated) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "אין הרשאה לערוך עדכון זה" },
        { status: 403 }
      ),
    };
  }

  return {
    ok: true,
    note: { id: note.id, authorEmail: note.author?.email ?? null },
  };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; noteId: string }> }
) {
  const { response: authResponse, email, role } = await requireAuth();
  if (authResponse) return authResponse;

  const { id: customerId, noteId } = await params;

  const authz = await loadNoteAndAuthorize(noteId, customerId, email, role);
  if (!authz.ok) return authz.response;

  let parsed;
  try {
    const raw = await request.json();
    parsed = updateSchema.parse(raw);
  } catch (err) {
    const msg =
      err instanceof z.ZodError
        ? err.issues[0]?.message ?? "בקשה לא תקינה"
        : "בקשה לא תקינה";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const updated = await prisma.customerNote.update({
    where: { id: noteId },
    data: { body: parsed.body },
    include: {
      author: { select: { id: true, name: true, email: true } },
    },
  });

  await logAudit({
    actorEmail: email,
    action: "customer_note_updated",
    entityType: "CustomerNote",
    entityId: noteId,
    details: { customerId },
  });

  return NextResponse.json({
    id: updated.id,
    body: updated.body,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
    author: updated.author
      ? {
          id: updated.author.id,
          name: updated.author.name,
          email: updated.author.email,
        }
      : null,
  });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; noteId: string }> }
) {
  const { response: authResponse, email, role } = await requireAuth();
  if (authResponse) return authResponse;

  const { id: customerId, noteId } = await params;

  const authz = await loadNoteAndAuthorize(noteId, customerId, email, role);
  if (!authz.ok) return authz.response;

  await prisma.customerNote.delete({ where: { id: noteId } });

  await logAudit({
    actorEmail: email,
    action: "customer_note_deleted",
    entityType: "CustomerNote",
    entityId: noteId,
    details: { customerId },
  });

  return NextResponse.json({ success: true });
}
