import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const articles = await prisma.knowledgeArticle.findMany({
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ items: articles });
}

export async function POST(request: NextRequest) {
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
