import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

/**
 * GET /api/rules/[id]/session?offset=0&limit=50
 *
 * Paginated: returns at most `limit` items (capped at 100, default 50).
 * Ordered open-first (status=NEW), then handled, each group by
 * strengthScore desc. Stats stay global across the whole rule so the
 * progress bar is accurate.
 *
 * Used by /rules/[id]/session — Rafi plows through one rule at a time,
 * and some rules match thousands of customers. We never want to dump
 * all of them into one response.
 */

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

const insightSelect = {
  id: true,
  status: true,
  strengthScore: true,
  title: true,
  summary: true,
  whyNow: true,
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
    },
  },
} as const;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { response: authResponse } = await requireAuth();
  if (authResponse) return authResponse;

  const { id: ruleId } = await params;

  const url = new URL(request.url);
  const rawOffset = Number.parseInt(url.searchParams.get("offset") ?? "0", 10);
  const rawLimit = Number.parseInt(
    url.searchParams.get("limit") ?? String(DEFAULT_LIMIT),
    10
  );
  const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? rawOffset : 0;
  const limit = Math.min(
    Math.max(Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : DEFAULT_LIMIT, 1),
    MAX_LIMIT
  );

  const rule = await prisma.officeRule.findUnique({
    where: { id: ruleId },
    select: {
      id: true,
      title: true,
      body: true,
      category: true,
      kind: true,
      baseStrength: true,
      triggerHint: true,
      triggerCondition: true,
      isActive: true,
    },
  });

  if (!rule) {
    return NextResponse.json({ error: "חוק לא נמצא" }, { status: 404 });
  }

  const openWhere = { linkedRuleId: ruleId, status: "NEW" as const };
  const handledWhere = {
    linkedRuleId: ruleId,
    status: { not: "NEW" as const },
  };

  const [openTotal, handledTotal] = await Promise.all([
    prisma.insight.count({ where: openWhere }),
    prisma.insight.count({ where: handledWhere }),
  ]);

  const total = openTotal + handledTotal;

  // Slice the requested page across the two groups (open first, handled
  // after). If offset falls past the open set, skip into the handled set.
  const openSkip = Math.min(offset, openTotal);
  const openTake = Math.max(0, Math.min(openTotal - openSkip, limit));
  const handledSkip = Math.max(0, offset - openTotal);
  const handledTake = Math.max(0, limit - openTake);

  const orderBy = [
    { strengthScore: "desc" as const },
    { createdAt: "desc" as const },
  ];

  const [openRows, handledRows] = await Promise.all([
    openTake > 0
      ? prisma.insight.findMany({
          where: openWhere,
          orderBy,
          skip: openSkip,
          take: openTake,
          select: insightSelect,
        })
      : Promise.resolve([]),
    handledTake > 0
      ? prisma.insight.findMany({
          where: handledWhere,
          orderBy,
          skip: handledSkip,
          take: handledTake,
          select: insightSelect,
        })
      : Promise.resolve([]),
  ]);

  const insights = [...openRows, ...handledRows];

  // External-policy count for the customers we're actually returning.
  const customerIds = insights.map((i) => i.customer.id);
  const externalCounts =
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
  const externalMap = new Map(
    externalCounts.map((p) => [p.customerId, p._count._all])
  );

  const items = insights.map((i) => ({
    insightId: i.id,
    status: i.status,
    strengthScore: i.strengthScore ?? 0,
    insightTitle: i.title,
    insightSummary: i.summary,
    whyNow: i.whyNow,
    customer: {
      ...i.customer,
      fullName: `${i.customer.firstName} ${i.customer.lastName}`.trim(),
      externalPolicyCount: externalMap.get(i.customer.id) ?? 0,
    },
  }));

  const returned = offset + items.length;
  const hasMore = returned < total;

  return NextResponse.json({
    rule,
    stats: {
      total,
      open: openTotal,
      handled: handledTotal,
    },
    items,
    pagination: {
      offset,
      limit,
      returned: items.length,
      total,
      hasMore,
      nextOffset: hasMore ? returned : null,
    },
  });
}
