import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { validateBody, queueActionSchema } from "@/lib/validation";
import { prisma } from "@/lib/db";
import { promoteFromSoon } from "@/lib/queue/generator";
import type { QueueStatus } from "@prisma/client";

const TERMINAL_STATUSES: QueueStatus[] = ["COMPLETED", "DISMISSED"];

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { response: authResponse, email, role, userId } = await requireAuth();
  if (authResponse) return authResponse;

  const roleResponse = requireRole(role, ["OWNER", "MANAGER", "AGENT"]);
  if (roleResponse) return roleResponse;

  const { id } = await context.params;

  // Validate UUID shape cheaply to avoid bad DB queries
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  ) {
    return NextResponse.json({ error: "מזהה לא תקין" }, { status: 400 });
  }

  const rawBody = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  // Accept `action` as a legacy synonym for `status`
  if (rawBody && rawBody.action !== undefined && rawBody.status === undefined) {
    rawBody.status = rawBody.action;
  }
  const validation = validateBody(queueActionSchema, rawBody);
  if (!validation.success) return validation.response;

  const { status, note, postponeUntil } = validation.data;

  const existing = await prisma.queueEntry.findUnique({
    where: { id },
    select: {
      id: true,
      queueDate: true,
      lane: true,
      assignedUserId: true,
      status: true,
      customerId: true,
    },
  });
  if (!existing) {
    return NextResponse.json(
      { error: "פריט לא נמצא" },
      { status: 404 }
    );
  }

  // Agents can only action their own assignments (managers/owners can action any)
  if (
    role === "AGENT" &&
    existing.assignedUserId &&
    existing.assignedUserId !== userId
  ) {
    return NextResponse.json(
      { error: "אין הרשאה לפעולה על פריט זה" },
      { status: 403 }
    );
  }

  if (existing.status !== "PENDING") {
    return NextResponse.json(
      { error: "הפריט כבר טופל" },
      { status: 409 }
    );
  }

  const now = new Date();
  let postponeUntilDate: Date | null = null;
  if (status === "POSTPONED" && postponeUntil) {
    postponeUntilDate = new Date(postponeUntil);
    if (Number.isNaN(postponeUntilDate.getTime()) || postponeUntilDate <= now) {
      return NextResponse.json(
        { error: "postponeUntil חייב להיות בעתיד" },
        { status: 400 }
      );
    }
  }

  const updated = await prisma.queueEntry.update({
    where: { id },
    data: {
      status,
      actionNote: note ?? null,
      actionedAt: now,
      actionedByUserId: userId,
      postponeUntil: postponeUntilDate,
    },
  });

  await logAudit({
    actorEmail: email,
    action: "queue_entry_actioned",
    entityType: "queue_entry",
    entityId: id,
    details: {
      status,
      note: note ?? null,
      postponeUntil: postponeUntilDate?.toISOString() ?? null,
      customerId: existing.customerId,
      lane: existing.lane,
    },
  });

  // If terminal in TODAY lane, promote a SOON entry to refill the slot
  let promoted = null as Awaited<ReturnType<typeof promoteFromSoon>>;
  if (
    existing.lane === "TODAY" &&
    TERMINAL_STATUSES.includes(status as QueueStatus)
  ) {
    try {
      promoted = await promoteFromSoon(
        existing.queueDate,
        existing.assignedUserId
      );
    } catch (err) {
      console.error("promoteFromSoon failed:", err);
    }
  }

  return NextResponse.json({
    entry: updated,
    promoted,
    // Alias for UI components that use a different name
    promotedEntry: promoted,
  });
}
