import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function GET() {
  const { response: authResponse } = await requireAuth();
  if (authResponse) return authResponse;
  const articles = await prisma.knowledgeArticle.findMany({
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ items: articles });
}

export async function POST(request: NextRequest) {
  const { response: authResponse, email, role } = await requireAuth();
  if (authResponse) return authResponse;

  const roleResponse = requireRole(role, ["OWNER", "MANAGER", "ADMIN"]);
  if (roleResponse) return roleResponse;

  const body = await request.json();
  const { title, content, source } = body;

  if (!title || !content) {
    return NextResponse.json(
      { error: "title and content are required" },
      { status: 400 }
    );
  }

  const article = await prisma.knowledgeArticle.create({
    data: {
      title,
      content,
      source: source || null,
    },
  });

  await logAudit({
    actorEmail: email,
    action: "knowledge_created",
    entityType: "knowledge",
    entityId: article.id,
    details: { title: article.title },
  });

  return NextResponse.json(article, { status: 201 });
}
