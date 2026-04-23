import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { validateBody, insightActionSchema } from "@/lib/validation";

/**
 * PATCH /api/insights/[id]
 *
 * Updates an individual insight's status. Used primarily by the rule
 * session page (/rules/[id]/session) where Rafi marks insights as
 * handled (REVIEWED), irrelevant (DISMISSED), or restores them (NEW)
 * without touching the queue lanes.
 *
 * Any authenticated user can perform this action, matching the
 * permission model of the queue action endpoint.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { response: authResponse, email } = await requireAuth();
  if (authResponse) return authResponse;

  const { id } = await params;

  // Validate UUID shape cheaply to avoid bad DB queries
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  ) {
    return NextResponse.json({ error: "מזהה לא תקין" }, { status: 400 });
  }

  const rawBody = await request.json().catch(() => ({}));
  const validation = validateBody(insightActionSchema, rawBody);
  if (!validation.success) return validation.response;

  const { status } = validation.data;

  const existing = await prisma.insight.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!existing) {
    return NextResponse.json(
      { error: "תובנה לא נמצאה" },
      { status: 404 }
    );
  }

  const updated = await prisma.insight.update({
    where: { id },
    data: { status },
  });

  await logAudit({
    actorEmail: email,
    action: "insight_action",
    entityType: "Insight",
    entityId: id,
    details: {
      oldStatus: existing.status,
      newStatus: status,
    },
  });

  return NextResponse.json(updated);
}
