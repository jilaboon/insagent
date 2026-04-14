import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ customerId: string }> }
) {
  const { response: authResponse } = await requireAuth();
  if (authResponse) return authResponse;

  const { customerId } = await params;

  const messages = await prisma.messageDraft.findMany({
    where: { customerId },
    include: {
      insight: { select: { id: true, title: true, category: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(messages);
}
