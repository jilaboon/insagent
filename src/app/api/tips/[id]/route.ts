import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { response: authResponse } = await requireAuth();
  if (authResponse) return authResponse;

  const { id } = await params;
  const body = await request.json();
  const { title, body: tipBody, category, triggerHint, isActive } = body;

  const updateData: Record<string, unknown> = {};
  if (title !== undefined) updateData.title = title;
  if (tipBody !== undefined) updateData.body = tipBody;
  if (category !== undefined) updateData.category = category;
  if (triggerHint !== undefined) updateData.triggerHint = triggerHint;
  if (isActive !== undefined) updateData.isActive = isActive;

  const updated = await prisma.officeTip.update({
    where: { id },
    data: updateData,
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { response: authResponse } = await requireAuth();
  if (authResponse) return authResponse;

  const { id } = await params;

  await prisma.officeTip.delete({
    where: { id },
  });

  return NextResponse.json({ success: true });
}
