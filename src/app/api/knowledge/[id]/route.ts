import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { response: authResponse } = await requireAuth();
  if (authResponse) return authResponse;

  const { id } = await params;

  const article = await prisma.knowledgeArticle.findUnique({
    where: { id },
  });

  if (!article) {
    return NextResponse.json({ error: "Article not found" }, { status: 404 });
  }

  return NextResponse.json(article);
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
    await prisma.knowledgeArticle.delete({
      where: { id },
    });

    await logAudit({
      actorEmail: email,
      action: "knowledge_deleted",
      entityType: "knowledge",
      entityId: id,
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Article not found" }, { status: 404 });
  }
}
