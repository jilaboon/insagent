import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

/**
 * GET /api/rules/[id]/session
 *
 * Returns every customer who currently has an active insight linked to
 * this rule, plus a status breakdown so the UI can show progress
 * ("14 טופלו, 28 נשארו"). Ordered by insight.strengthScore desc —
 * strongest/most relevant at the top.
 *
 * Used by /rules/[id]/session — the focused-work surface where Rafi
 * sits for a couple of hours and plows through one rule at a time.
 */

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { response: authResponse } = await requireAuth();
  if (authResponse) return authResponse;

  const { id: ruleId } = await params;

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

  const insights = await prisma.insight.findMany({
    where: { linkedRuleId: ruleId },
    orderBy: [{ strengthScore: "desc" }, { createdAt: "desc" }],
    select: {
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
    },
  });

  // Progress breakdown. "Handled" = any action was taken;
  // "open" = still NEW.
  let open = 0;
  let handled = 0;
  for (const i of insights) {
    if (i.status === "NEW") open += 1;
    else handled += 1;
  }

  // Optional: for each matching customer, pull their active external
  // policy count so the UI can flag "📂 פוטנציאל" like the queue card.
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

  return NextResponse.json({
    rule,
    stats: {
      total: insights.length,
      open,
      handled,
    },
    items,
  });
}
