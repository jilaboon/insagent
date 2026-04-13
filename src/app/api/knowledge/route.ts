import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function GET() {
  const { response: authResponse } = await requireAuth();
  if (authResponse) return authResponse;
  const articles = await prisma.knowledgeArticle.findMany({
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ items: articles });
}

export async function POST(request: NextRequest) {
  const { response: authResponse } = await requireAuth();
  if (authResponse) return authResponse;

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

  return NextResponse.json(article, { status: 201 });
}
