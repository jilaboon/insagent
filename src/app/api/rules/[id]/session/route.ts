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
// Raised so the session UI can pull all matches in one go when the user
// asks for cross-page sorting (e.g. by triggering premium). Triggering-
// premium isn't sortable in SQL because it depends on policies referenced
// inside evidenceJson — so we hand the full set to the client.
const MAX_LIMIT = 2000;

const insightSelect = {
  id: true,
  status: true,
  strengthScore: true,
  title: true,
  summary: true,
  whyNow: true,
  // evidenceJson holds both the score breakdown (so Rafi can hover the
  // strength badge and see how it was computed) and the matchedPolicyIds
  // (so we can attach the actual triggering policies to each row).
  evidenceJson: true,
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

// ============================================================
// Score breakdown extraction — kept in sync with the helper in
// src/app/api/customers/[id]/route.ts. evidenceJson is JSONB so Prisma
// hands back a parsed object/array/null. Older insights pre-dating the
// breakdown feature simply return null and the UI falls back to the
// plain badge.
// ============================================================
type ScoreBoost = { label: string; delta: number };
type ScoreBreakdown = {
  base: number;
  contextBoosts: ScoreBoost[];
  urgencyBoosts: ScoreBoost[];
  finalScore: number;
};

function extractScoreBreakdown(evidenceJson: unknown): ScoreBreakdown | null {
  if (!evidenceJson || typeof evidenceJson !== "object") return null;
  const record = evidenceJson as Record<string, unknown>;
  const raw = record.scoreBreakdown;
  if (!raw || typeof raw !== "object") return null;

  const obj = raw as Record<string, unknown>;
  const base = typeof obj.base === "number" ? obj.base : null;
  const finalScore =
    typeof obj.finalScore === "number" ? obj.finalScore : null;
  if (base === null || finalScore === null) return null;

  const normBoosts = (value: unknown): ScoreBoost[] => {
    if (!Array.isArray(value)) return [];
    return value
      .filter(
        (b): b is ScoreBoost =>
          !!b &&
          typeof b === "object" &&
          typeof (b as ScoreBoost).label === "string" &&
          typeof (b as ScoreBoost).delta === "number"
      )
      .map((b) => ({ label: b.label, delta: b.delta }));
  };

  return {
    base,
    contextBoosts: normBoosts(obj.contextBoosts),
    urgencyBoosts: normBoosts(obj.urgencyBoosts),
    finalScore,
  };
}

// ============================================================
// matchedPolicyIds extraction — defensive against missing field on
// older insights generated before the matcher started recording
// triggering policies.
// ============================================================
function extractMatchedPolicyIds(evidenceJson: unknown): string[] {
  if (!evidenceJson || typeof evidenceJson !== "object") return [];
  const record = evidenceJson as Record<string, unknown>;
  const raw = record.matchedPolicyIds;
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === "string");
}

// ============================================================
// Response item types — exposed to the page.tsx consumer
// ============================================================
export interface SessionTriggeringPolicy {
  id: string;
  policyNumber: string;
  insurer: string;
  startDate: string | null;
  premiumMonthly: number | null;
  premiumAnnual: number | null;
  category: string;
  status: string;
}

export interface SessionItemPayload {
  insightId: string;
  status: string;
  strengthScore: number;
  insightTitle: string;
  insightSummary: string;
  whyNow: string | null;
  customer: {
    id: string;
    firstName: string;
    lastName: string;
    fullName: string;
    israeliId: string;
    phone: string | null;
    email: string | null;
    age: number | null;
    source: string | null;
    externalPolicyCount: number;
    tenureYears: number | null;
  };
  scoreBreakdown: ScoreBreakdown | null;
  triggeringPolicies: SessionTriggeringPolicy[];
}

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

  // Single groupBy instead of two counts — covered by the
  // (linkedRuleId, status) index so the query is a quick index scan.
  const statusGroups = await prisma.insight.groupBy({
    by: ["status"],
    where: { linkedRuleId: ruleId },
    _count: { _all: true },
  });
  let openTotal = 0;
  let handledTotal = 0;
  for (const g of statusGroups) {
    if (g.status === "NEW") openTotal += g._count._all;
    else handledTotal += g._count._all;
  }
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

  // Office tenure per customer — oldest startDate across all of THEIR
  // policies excluding Har HaBituach. Cancelled and expired count too;
  // they prove the customer was once with us.
  const tenureRows =
    customerIds.length > 0
      ? await prisma.policy.groupBy({
          by: ["customerId"],
          where: {
            customerId: { in: customerIds },
            externalSource: { not: "HAR_HABITUACH" },
            startDate: { not: null },
          },
          _min: { startDate: true },
        })
      : [];
  const tenureMap = new Map<string, number | null>();
  for (const row of tenureRows) {
    if (!row._min.startDate) {
      tenureMap.set(row.customerId, null);
      continue;
    }
    const years =
      (Date.now() - row._min.startDate.getTime()) /
      (365.25 * 24 * 60 * 60 * 1000);
    tenureMap.set(row.customerId, years);
  }

  // Collect the union of all triggering policy IDs across the page so
  // we can fetch them in ONE round trip rather than N. Older insights
  // that lack the field contribute nothing — the section just won't
  // render for them on the UI.
  const insightMatchedIds = insights.map((i) => ({
    insightId: i.id,
    matchedPolicyIds: extractMatchedPolicyIds(i.evidenceJson),
  }));
  const allPolicyIds = Array.from(
    new Set(insightMatchedIds.flatMap((x) => x.matchedPolicyIds))
  );

  const policyRows =
    allPolicyIds.length > 0
      ? await prisma.policy.findMany({
          where: { id: { in: allPolicyIds } },
          select: {
            id: true,
            policyNumber: true,
            insurer: true,
            startDate: true,
            premiumMonthly: true,
            premiumAnnual: true,
            category: true,
            status: true,
          },
        })
      : [];
  const policyMap = new Map(policyRows.map((p) => [p.id, p]));

  const items: SessionItemPayload[] = insights.map((i) => {
    const matchedIds = extractMatchedPolicyIds(i.evidenceJson);
    const triggeringPolicies: SessionTriggeringPolicy[] = matchedIds
      .map((pid) => policyMap.get(pid))
      .filter((p): p is NonNullable<typeof p> => Boolean(p))
      .map((p) => ({
        id: p.id,
        policyNumber: p.policyNumber,
        insurer: p.insurer,
        startDate: p.startDate ? p.startDate.toISOString() : null,
        premiumMonthly: p.premiumMonthly ?? null,
        premiumAnnual: p.premiumAnnual ?? null,
        category: p.category,
        status: p.status,
      }));

    return {
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
        tenureYears: tenureMap.get(i.customer.id) ?? null,
      },
      scoreBreakdown: extractScoreBreakdown(i.evidenceJson),
      triggeringPolicies,
    };
  });

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
