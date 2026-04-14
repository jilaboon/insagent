import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { response: authResponse, email, role } = await requireAuth();
  if (authResponse) return authResponse;

  const roleResponse = requireRole(role, ["OWNER", "MANAGER", "ADMIN"]);
  if (roleResponse) return roleResponse;

  const { id } = await params;
  const body = await request.json();
  const { title, body: ruleBody, category, triggerCondition, triggerHint, isActive, source } = body;

  const updateData: Record<string, unknown> = {};
  if (title !== undefined) updateData.title = title;
  if (ruleBody !== undefined) updateData.body = ruleBody;
  if (category !== undefined) updateData.category = category;
  if (triggerCondition !== undefined) updateData.triggerCondition = triggerCondition;
  if (triggerHint !== undefined) updateData.triggerHint = triggerHint;
  if (isActive !== undefined) updateData.isActive = isActive;
  if (source !== undefined) updateData.source = source;

  try {
    const updated = await prisma.officeRule.update({
      where: { id },
      data: updateData,
    });

    await logAudit({
      actorEmail: email,
      action: "rule_updated",
      entityType: "rule",
      entityId: id,
      details: updateData,
    });

    return NextResponse.json(updated);
  } catch {
    return NextResponse.json(
      { error: "כלל לא נמצא" },
      { status: 404 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { response: authResponse, email, role } = await requireAuth();
  if (authResponse) return authResponse;

  const roleResponse = requireRole(role, ["OWNER", "MANAGER", "ADMIN"]);
  if (roleResponse) return roleResponse;

  const { id } = await params;

  try {
    await prisma.officeRule.delete({
      where: { id },
    });

    await logAudit({
      actorEmail: email,
      action: "rule_deleted",
      entityType: "rule",
      entityId: id,
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "כלל לא נמצא" },
      { status: 404 }
    );
  }
}
