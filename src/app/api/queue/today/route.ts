import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  const { response: authResponse, userId, role } = await requireAuth();
  if (authResponse) return authResponse;

  const url = new URL(request.url);
  const assignedParam = url.searchParams.get("assignedUserId");

  // AGENTS can only query their own queue. OWNER/MANAGER/ADMIN can query any.
  let assignedUserId: string | undefined | null;
  if (role === "AGENT") {
    assignedUserId = userId;
  } else {
    // "me" = current user; omitted = office-wide (no assignee filter)
    assignedUserId =
      assignedParam === "me" ? userId : assignedParam ?? undefined;
  }

  const queueDate = startOfDayUTC();

  const entries = await prisma.queueEntry.findMany({
    where: {
      queueDate,
      lane: "TODAY",
      ...(assignedUserId !== undefined
        ? { assignedUserId: assignedUserId }
        : {}),
    },
    orderBy: { rank: "asc" },
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
          whyNow: true,
          category: true,
          strengthScore: true,
          urgencyLevel: true,
          linkedRuleId: true,
        },
      },
    },
  });

  // Fetch supporting insights in one query
  const allSupportingIds = entries.flatMap((e) => e.supportingInsightIds);
  const supporting =
    allSupportingIds.length > 0
      ? await prisma.insight.findMany({
          where: { id: { in: allSupportingIds } },
          select: {
            id: true,
            title: true,
            summary: true,
            category: true,
            strengthScore: true,
          },
        })
      : [];
  const supportingById = new Map(supporting.map((s) => [s.id, s]));

  // Policy counts per customer (single query)
  const customerIds = entries.map((e) => e.customerId);
  const policyCounts =
    customerIds.length > 0
      ? await prisma.policy.groupBy({
          by: ["customerId"],
          where: { customerId: { in: customerIds }, status: "ACTIVE" },
          _count: { _all: true },
        })
      : [];
  const policyCountByCustomer = new Map(
    policyCounts.map((p) => [p.customerId, p._count._all])
  );

  const items = entries.map((e) => ({
    id: e.id,
    rank: e.rank,
    lane: e.lane,
    status: e.status,
    queueDate: e.queueDate,
    whyTodayReason: e.whyTodayReason,
    reasonCategory: e.reasonCategory,
    generationReason: e.generationReason,
    assignedUserId: e.assignedUserId,
    postponeUntil: e.postponeUntil,
    actionedAt: e.actionedAt,
    createdAt: e.createdAt,
    customer: {
      ...e.customer,
      fullName: `${e.customer.firstName} ${e.customer.lastName}`,
      activePolicyCount: policyCountByCustomer.get(e.customerId) ?? 0,
    },
    primaryInsight: e.primaryInsight,
    supportingInsights: e.supportingInsightIds
      .map((id) => supportingById.get(id))
      .filter((x): x is NonNullable<typeof x> => !!x),
  }));

  return NextResponse.json({ items, total: items.length });
}

function startOfDayUTC(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
