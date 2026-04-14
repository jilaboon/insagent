import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  const { response: authResponse, userId, role } = await requireAuth();
  if (authResponse) return authResponse;

  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const limit = Math.min(
    100,
    Math.max(1, parseInt(url.searchParams.get("limit") ?? "25", 10) || 25)
  );
  const assignedParam = url.searchParams.get("assignedUserId");

  // AGENTS can only query their own queue. OWNER/MANAGER/ADMIN can query any.
  let assignedUserId: string | undefined | null;
  if (role === "AGENT") {
    assignedUserId = userId;
  } else {
    assignedUserId =
      assignedParam === "me" ? userId : assignedParam ?? undefined;
  }

  const queueDate = startOfDayUTC();

  const where = {
    queueDate,
    lane: "SOON" as const,
    ...(assignedUserId !== undefined ? { assignedUserId } : {}),
  };

  const [total, entries] = await Promise.all([
    prisma.queueEntry.count({ where }),
    prisma.queueEntry.findMany({
      where,
      orderBy: { rank: "asc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        customer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            israeliId: true,
            phone: true,
            email: true,
            age: true,
          },
        },
        primaryInsight: {
          select: {
            id: true,
            title: true,
            summary: true,
            category: true,
            strengthScore: true,
            urgencyLevel: true,
          },
        },
      },
    }),
  ]);

  const items = entries.map((e) => ({
    id: e.id,
    rank: e.rank,
    lane: e.lane,
    status: e.status,
    whyTodayReason: e.whyTodayReason,
    reasonCategory: e.reasonCategory,
    queueDate: e.queueDate,
    customer: {
      ...e.customer,
      fullName: `${e.customer.firstName} ${e.customer.lastName}`,
    },
    primaryInsight: e.primaryInsight,
    supportingInsightIds: e.supportingInsightIds,
  }));

  return NextResponse.json({
    items,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
}

function startOfDayUTC(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
