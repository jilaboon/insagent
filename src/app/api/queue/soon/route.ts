import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { resolveCardBucket } from "@/lib/queue/buckets";

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
    status: "PENDING" as const,
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
            source: true,
            lastHarHabituachImportAt: true,
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
            linkedRuleId: true,
          },
        },
      },
    }),
  ]);

  // Resolve office bucket per card — same source as the /today API so the
  // two lanes show consistent tags (כיסוי/חיסכון/שירות/כללי).
  const ruleIds = Array.from(
    new Set(
      entries
        .map((e) => e.primaryInsight?.linkedRuleId)
        .filter((x): x is string => !!x)
    )
  );
  const rules =
    ruleIds.length > 0
      ? await prisma.officeRule.findMany({
          where: { id: { in: ruleIds } },
          select: { id: true, category: true },
        })
      : [];
  const ruleCategoryById = new Map(rules.map((r) => [r.id, r.category]));

  // Active policy counts per customer — same shape as /today
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

  // External (Har HaBituach) policy counts
  const externalPolicyCounts =
    customerIds.length > 0
      ? await prisma.policy.groupBy({
          by: ["customerId"],
          where: {
            customerId: { in: customerIds },
            externalSource: "HAR_HABITUACH",
          },
          _count: { _all: true },
        })
      : [];
  const externalPolicyCountByCustomer = new Map(
    externalPolicyCounts.map((p) => [p.customerId, p._count._all])
  );

  const items = entries.map((e) => {
    const ruleCategory = e.primaryInsight?.linkedRuleId
      ? ruleCategoryById.get(e.primaryInsight.linkedRuleId) ?? null
      : null;
    const bucket = resolveCardBucket(
      e.reasonCategory,
      ruleCategory,
      e.primaryInsight?.category
    );

    return {
      id: e.id,
      rank: e.rank,
      lane: e.lane,
      status: e.status,
      whyTodayReason: e.whyTodayReason,
      reasonCategory: e.reasonCategory,
      bucket,
      queueDate: e.queueDate,
      customer: {
        ...e.customer,
        fullName: `${e.customer.firstName} ${e.customer.lastName}`,
        activePolicyCount: policyCountByCustomer.get(e.customerId) ?? 0,
        externalPolicyCount:
          externalPolicyCountByCustomer.get(e.customerId) ?? 0,
      },
      primaryInsight: e.primaryInsight,
      supportingInsightIds: e.supportingInsightIds,
    };
  });

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
