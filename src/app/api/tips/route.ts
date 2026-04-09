import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const tips = await prisma.officeTip.findMany({
    orderBy: { createdAt: "desc" },
  });

  const activeCount = tips.filter((t) => t.isActive).length;

  return NextResponse.json({
    items: tips,
    total: tips.length,
    activeCount,
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { title, body: tipBody, category, triggerHint } = body;

  if (!title || !tipBody) {
    return NextResponse.json(
      { error: "title and body are required" },
      { status: 400 }
    );
  }

  const tip = await prisma.officeTip.create({
    data: {
      title,
      body: tipBody,
      category: category || null,
      triggerHint: triggerHint || null,
      isActive: true,
    },
  });

  return NextResponse.json(tip, { status: 201 });
}
