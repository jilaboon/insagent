import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

/**
 * Customer conversation journal.
 *
 * GET  /api/customers/[id]/notes   — list all notes for a customer, newest first
 * POST /api/customers/[id]/notes   — create a new note (body: { body: string })
 *
 * Notes are a running log of agent-authored updates: calls placed,
 * offers made, return-date commitments. They prevent re-contacting the
 * same customer about the same thing by giving the next agent context.
 */

const createSchema = z.object({
  body: z.string().trim().min(1, "לא ניתן להוסיף עדכון ריק").max(4000),
});

const ELEVATED_ROLES = new Set(["OWNER", "MANAGER", "ADMIN"]);

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { response: authResponse, email, role } = await requireAuth();
  if (authResponse) return authResponse;

  const { id } = await params;

  const notes = await prisma.customerNote.findMany({
    where: { customerId: id },
    orderBy: { createdAt: "desc" },
    include: {
      author: { select: { id: true, name: true, email: true } },
    },
  });

  const canEditAny = role != null && ELEVATED_ROLES.has(role);

  return NextResponse.json({
    items: notes.map((n) => {
      const isMine = n.author?.email === email;
      return {
        id: n.id,
        body: n.body,
        createdAt: n.createdAt.toISOString(),
        updatedAt: n.updatedAt.toISOString(),
        author: n.author
          ? { id: n.author.id, name: n.author.name, email: n.author.email }
          : null,
        // Server-authoritative: client doesn't need to know the current
        // user's email to render edit/delete. Elevated roles can edit any.
        canEdit: isMine || canEditAny,
      };
    }),
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { response: authResponse, email, role } = await requireAuth();
  if (authResponse) return authResponse;

  const { id: customerId } = await params;

  // Verify the customer exists before touching the notes table
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { id: true },
  });
  if (!customer) {
    return NextResponse.json({ error: "לקוח לא נמצא" }, { status: 404 });
  }

  let parsed;
  try {
    const raw = await request.json();
    parsed = createSchema.parse(raw);
  } catch (err) {
    const msg =
      err instanceof z.ZodError
        ? err.issues[0]?.message ?? "בקשה לא תקינה"
        : "בקשה לא תקינה";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  // Find or create the User record for the current identity so we can
  // attribute the note. Same pattern as other authenticated endpoints.
  const author = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      name: email.split("@")[0],
      role: role ?? "AGENT",
    },
    update: {},
  });

  const note = await prisma.customerNote.create({
    data: {
      customerId,
      authorId: author.id,
      body: parsed.body,
    },
    include: {
      author: { select: { id: true, name: true, email: true } },
    },
  });

  await logAudit({
    actorEmail: email,
    action: "customer_note_created",
    entityType: "CustomerNote",
    entityId: note.id,
    details: { customerId },
  });

  return NextResponse.json({
    id: note.id,
    body: note.body,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
    author: note.author
      ? { id: note.author.id, name: note.author.name, email: note.author.email }
      : null,
  });
}
