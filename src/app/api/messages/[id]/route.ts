import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

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

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { response: authResponse } = await requireAuth();
  if (authResponse) return authResponse;

  const { id } = await params;
  const body = await request.json();
  const { status, bodyText, feedbackFlag, feedbackNote } = body;

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

  return NextResponse.json(updated);
}
