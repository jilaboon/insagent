import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

/**
 * Backward-compatible tips API.
 * GET returns OfficeTip records (legacy).
 * POST creates in both OfficeTip and OfficeRule tables.
 */

export async function GET() {
  const { response: authResponse } = await requireAuth();
  if (authResponse) return authResponse;

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
  const { response: authResponse } = await requireAuth();
  if (authResponse) return authResponse;

  const body = await request.json();
  const { title, body: tipBody, category, triggerHint } = body;

  if (!title || !tipBody) {
    return NextResponse.json(
      { error: "title and body are required" },
      { status: 400 }
    );
  }

  // Create in legacy table
  const tip = await prisma.officeTip.create({
    data: {
      title,
      body: tipBody,
      category: category || null,
      triggerHint: triggerHint || null,
      isActive: true,
    },
  });

  // Also create in new OfficeRule table for forward compatibility
  await prisma.officeRule.create({
    data: {
      title,
      body: tipBody,
      category: category || null,
      triggerHint: triggerHint || null,
      source: "MANUAL",
      isActive: true,
    },
  });

  return NextResponse.json(tip, { status: 201 });
}
