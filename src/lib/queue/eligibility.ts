/**
 * Eligibility gate checks for the daily action queue.
 *
 * A candidate (customer + insight) must pass ALL gates to enter TODAY.
 * Time-critical items (urgent expiry, recent milestones) can bypass the
 * "recent contact" gate because the business requires timely outreach.
 */

import { prisma } from "@/lib/db";

export interface EligibilityResult {
  eligible: boolean;
  gateResults: Record<string, boolean>;
  bypassReasons: string[];
}

interface CheckOptions {
  timeCritical?: boolean;
  /**
   * Precomputed cache to avoid per-candidate DB round-trips when evaluating
   * hundreds of candidates inside buildQueue. All fields optional.
   */
  cache?: EligibilityCache;
}

export interface EligibilityCache {
  /** Set of `${customerId}:${ruleId}` with DISMISSED entry in last 60 days. */
  dismissedRecently: Set<string>;
  /** Set of `${customerId}:${ruleId}` with active POSTPONED entry. */
  pendingPostpone: Set<string>;
  /** Set of customerIds that have an OPEN or IN_PROGRESS task linked to a recommendation for the same rule. */
  openTaskByCustomerRule: Set<string>;
  /** Set of customerIds that had a SENT message in the last 30 days. */
  recentlyContacted: Set<string>;
  /** Map of insightId -> status to check HANDLED/DISMISSED. */
  insightStatusById: Map<string, string>;
}

const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Build a cache of all the aggregate lookups in a handful of queries.
 * This is called once at the start of buildQueue.
 */
export async function buildEligibilityCache(): Promise<EligibilityCache> {
  const sixtyDaysAgo = new Date(Date.now() - SIXTY_DAYS_MS);
  const thirtyDaysAgo = new Date(Date.now() - THIRTY_DAYS_MS);
  const now = new Date();

  const [dismissed, postponed, openTasks, recentMessages, insights] =
    await Promise.all([
      prisma.queueEntry.findMany({
        where: {
          status: "DISMISSED",
          createdAt: { gte: sixtyDaysAgo },
        },
        select: {
          customerId: true,
          primaryInsight: { select: { linkedRuleId: true } },
        },
      }),
      prisma.queueEntry.findMany({
        where: {
          status: "POSTPONED",
          postponeUntil: { gt: now },
        },
        select: {
          customerId: true,
          primaryInsight: { select: { linkedRuleId: true } },
        },
      }),
      prisma.task.findMany({
        where: {
          status: { in: ["OPEN", "IN_PROGRESS"] },
          customerId: { not: null },
          linkedRecommendationId: { not: null },
        },
        select: { customerId: true, linkedRecommendationId: true },
      }),
      prisma.messageDraft.findMany({
        where: {
          status: "SENT",
          updatedAt: { gte: thirtyDaysAgo },
        },
        select: { customerId: true },
      }),
      prisma.insight.findMany({
        select: { id: true, status: true },
      }),
    ]);

  const dismissedRecently = new Set<string>();
  for (const d of dismissed) {
    const ruleId = d.primaryInsight?.linkedRuleId ?? "_";
    dismissedRecently.add(`${d.customerId}:${ruleId}`);
  }

  const pendingPostpone = new Set<string>();
  for (const p of postponed) {
    const ruleId = p.primaryInsight?.linkedRuleId ?? "_";
    pendingPostpone.add(`${p.customerId}:${ruleId}`);
  }

  // Resolve linkedRecommendation -> rule
  const recIds = openTasks
    .map((t) => t.linkedRecommendationId)
    .filter((x): x is string => !!x);
  const openTaskByCustomerRule = new Set<string>();
  if (recIds.length > 0) {
    const recs = await prisma.recommendation.findMany({
      where: { id: { in: recIds } },
      select: {
        id: true,
        insight: { select: { linkedRuleId: true } },
      },
    });
    const recRuleMap = new Map<string, string | null>();
    for (const r of recs) {
      recRuleMap.set(r.id, r.insight?.linkedRuleId ?? null);
    }
    for (const t of openTasks) {
      if (!t.customerId || !t.linkedRecommendationId) continue;
      const ruleId = recRuleMap.get(t.linkedRecommendationId);
      if (ruleId) {
        openTaskByCustomerRule.add(`${t.customerId}:${ruleId}`);
      }
    }
  }

  const recentlyContacted = new Set<string>();
  for (const m of recentMessages) recentlyContacted.add(m.customerId);

  const insightStatusById = new Map<string, string>();
  for (const i of insights) insightStatusById.set(i.id, i.status);

  return {
    dismissedRecently,
    pendingPostpone,
    openTaskByCustomerRule,
    recentlyContacted,
    insightStatusById,
  };
}

export async function checkEligibility(
  customerId: string,
  insightId: string,
  ruleId: string | null,
  options: CheckOptions = {}
): Promise<EligibilityResult> {
  const cache = options.cache ?? (await buildEligibilityCache());
  const timeCritical = options.timeCritical ?? false;
  const ruleKey = ruleId ?? "_";
  const composite = `${customerId}:${ruleKey}`;

  const insightStatus = cache.insightStatusById.get(insightId);
  const notCompleted =
    !!insightStatus &&
    insightStatus !== "DISMISSED" &&
    // Insight schema has no HANDLED — treat CONVERTED_TO_* as handled
    insightStatus !== "CONVERTED_TO_RECOMMENDATION" &&
    insightStatus !== "CONVERTED_TO_TASK";

  const noRecentDismissal = !cache.dismissedRecently.has(composite);
  const noPendingPostpone = !cache.pendingPostpone.has(composite);
  const noOpenTask = !cache.openTaskByCustomerRule.has(composite);

  const recentContactBlocked = cache.recentlyContacted.has(customerId);
  const recentContactOk = timeCritical ? true : !recentContactBlocked;

  const gateResults: Record<string, boolean> = {
    notCompleted,
    noRecentDismissal,
    noPendingPostpone,
    noOpenTask,
    recentContactOk,
  };

  const bypassReasons: string[] = [];
  if (timeCritical && recentContactBlocked) {
    bypassReasons.push("time_critical_bypasses_recent_contact");
  }

  const eligible = Object.values(gateResults).every(Boolean);

  return { eligible, gateResults, bypassReasons };
}
