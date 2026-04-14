import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  const { response: authResponse, userId } = await requireAuth();
  if (authResponse) return authResponse;

  const url = new URL(request.url);
  const assignedParam = url.searchParams.get("assignedUserId");
  const assignedUserId =
    assignedParam === "me" ? userId : assignedParam ?? undefined;
  const assigneeFilter =
    assignedUserId !== undefined ? { assignedUserId } : {};

  const queueDate = startOfDayUTC();

  const [todayCount, soonCount, pendingApprovals, lastRebuild, completedToday] =
    await Promise.all([
      prisma.queueEntry.count({
        where: {
          queueDate,
          lane: "TODAY",
          status: "PENDING",
          ...assigneeFilter,
        },
      }),
      prisma.queueEntry.count({
        where: {
          queueDate,
          lane: "SOON",
          status: "PENDING",
          ...assigneeFilter,
        },
      }),
      prisma.recommendation.count({
        where: { status: "PENDING" },
      }),
      prisma.auditEntry.findFirst({
        where: { action: "queue_rebuilt" },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      }),
      prisma.queueEntry.count({
        where: {
          queueDate,
          status: "COMPLETED",
          ...assigneeFilter,
        },
      }),
    ]);

  return NextResponse.json({
    todayCount,
    soonCount,
    pendingApprovals,
    lastRebuildAt: lastRebuild?.createdAt ?? null,
    completedToday,
  });
}

function startOfDayUTC(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
