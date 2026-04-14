import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { messageUpdateSchema, validateBody } from "@/lib/validation";

/**
 * GET — kept for backward compatibility, treats [id] as customerId.
 * Clients should migrate to /api/messages/customer/[customerId].
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { response: authResponse } = await requireAuth();
  if (authResponse) return authResponse;

  const { id } = await params;

  const messages = await prisma.messageDraft.findMany({
    where: { customerId: id },
    include: {
      insight: { select: { id: true, title: true, category: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(messages);
}

/**
 * PUT — update a specific message draft by its ID.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { response: authResponse, email } = await requireAuth();
  if (authResponse) return authResponse;

  const { id } = await params;
  const rawBody = await request.json();
  const validation = validateBody(messageUpdateSchema, rawBody);
  if (!validation.success) return validation.response;

  const { status, bodyText, feedbackFlag, feedbackNote } = validation.data;

  const updateData: Record<string, unknown> = {};
  if (status) updateData.status = status;
  if (bodyText) updateData.body = bodyText;
  if (feedbackFlag) {
    updateData.feedbackFlag = feedbackFlag;
    updateData.feedbackNote = feedbackNote || null;
    updateData.feedbackAt = new Date();
  }

  const updated = await prisma.messageDraft.update({
    where: { id },
    data: updateData,
  });

  // Audit: message status change
  if (status) {
    await logAudit({
      actorEmail: email,
      action: "message_status_changed",
      entityType: "message",
      entityId: id,
      details: { newStatus: status },
    });
  }

  return NextResponse.json(updated);
}
