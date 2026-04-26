import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

/**
 * GET /api/rules/match-counts
 *
 * Returns a map of ruleId -> { total, open } counting linked insights.
 * Used by /rules to show how many customers each rule will surface
 * BEFORE the user enters its session — so Rafi knows which rules
 * are worth opening right now.
 *
 * Single Prisma groupBy by (linkedRuleId, status) — covered by the
 * (linkedRuleId, status) compound index, so this is a quick index scan
 * even on large insight tables.
 */
export async function GET() {
  const { response: authResponse } = await requireAuth();
  if (authResponse) return authResponse;

  const groups = await prisma.insight.groupBy({
    by: ["linkedRuleId", "status"],
    where: { linkedRuleId: { not: null } },
    _count: { _all: true },
  });

  const counts: Record<string, { total: number; open: number }> = {};
  for (const g of groups) {
    if (!g.linkedRuleId) continue;
    const entry = counts[g.linkedRuleId] ?? { total: 0, open: 0 };
    entry.total += g._count._all;
    if (g.status === "NEW") entry.open += g._count._all;
    counts[g.linkedRuleId] = entry;
  }

  return NextResponse.json({ counts });
}
