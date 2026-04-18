/**
 * Queue builder — assembles the daily action queue (TODAY + SOON lanes)
 * for a given assignee (or the office as a whole if assignedUserId is null).
 *
 * Performance-critical: uses raw SQL for customer/policy loads, similar
 * to the insight generator. Eligibility lookups are precomputed once.
 */

import { prisma } from "@/lib/db";
import type { GenerationReason, QueueEntry, ReasonCategory } from "@prisma/client";
import {
  buildEligibilityCache,
  checkEligibility,
  type EligibilityCache,
} from "./eligibility";
import {
  determineReasonCategory,
  buildWhyTodayReason,
  isTimeCritical,
  type ReasonContext,
  type ReasonPolicy,
  type ReasonCustomer,
  type ReasonInsight,
} from "./reason-builder";
import { getQueueSettings } from "./settings";
import { computePriority, type PriorityBreakdown } from "./priority";
import { resolveBucket } from "./buckets";

interface BuildQueueOptions {
  reason: GenerationReason;
  assignedUserId?: string;
  capacity?: number;
  reserveUrgentSlots?: number;
}

interface Candidate {
  customerId: string;
  primaryInsight: ReasonInsight;
  supportingInsightIds: string[];
  ctx: ReasonContext;
  reasonCategory: ReasonCategory;
  whyToday: string;
  timeCritical: boolean;
  gateResults: Record<string, boolean>;
  score: number;
  priority: PriorityBreakdown;
  daysToExpiry: number | null;
}

const SOON_CAPACITY = 50;

function startOfDayUTC(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export async function buildQueue(
  options: BuildQueueOptions
): Promise<{ today: number; soon: number }> {
  const reason = options.reason;
  const assignedUserId = options.assignedUserId ?? null;
  const settings = await getQueueSettings();
  const capacity = options.capacity ?? settings.dailyCapacity;
  const reserveUrgentSlots = Math.min(
    options.reserveUrgentSlots ?? settings.urgentReserveSlots,
    capacity
  );

  const queueDate = startOfDayUTC();

  // Delete existing PENDING entries for this queueDate+assignedUserId
  // (keep actioned entries — they're part of the audit trail).
  await prisma.queueEntry.deleteMany({
    where: {
      queueDate,
      assignedUserId,
      status: "PENDING",
    },
  });

  // Load candidates via raw SQL (same pattern as insight generator).
  // Filter out customers with no real name — the import sets firstName to
  // "לא ידוע" (unknown) when the source row had no name. Showing those in
  // the queue kills trust (the agent can't identify who to call).
  const nameFilter = `(c."firstName" IS NOT NULL AND c."firstName" != '' AND c."firstName" != 'לא ידוע')`;
  const customerWhereSql = assignedUserId
    ? `WHERE c."assignedManagerId" = $1 AND ${nameFilter}`
    : `WHERE ${nameFilter}`;
  const customerParams = assignedUserId ? [assignedUserId] : [];

  const customerRows = (await prisma.$queryRawUnsafe(
    `SELECT c.id, c.age, c."dateOfBirth", c."lastReviewDate", c."assignedManagerId"
     FROM customers c ${customerWhereSql}`,
    ...customerParams
  )) as Array<{
    id: string;
    age: number | null;
    dateOfBirth: Date | null;
    lastReviewDate: Date | null;
    assignedManagerId: string | null;
  }>;

  if (customerRows.length === 0) {
    return { today: 0, soon: 0 };
  }
  const customerIds = customerRows.map((c) => c.id);

  const policyRows = (await prisma.$queryRawUnsafe(
    `SELECT id, "customerId", category, status, "endDate",
            "premiumMonthly", "premiumAnnual", "accumulatedSavings"
     FROM policies WHERE "customerId" = ANY($1)`,
    customerIds
  )) as Array<{
    id: string;
    customerId: string;
    category: string;
    status: string;
    endDate: Date | null;
    premiumMonthly: number | null;
    premiumAnnual: number | null;
    accumulatedSavings: number | null;
  }>;

  const mgmtFeeRows = (await prisma.$queryRawUnsafe(
    `SELECT mf."policyId", mf."ratePercent", p."customerId"
     FROM management_fees mf
     JOIN policies p ON p.id = mf."policyId"
     WHERE p."customerId" = ANY($1)`,
    customerIds
  )) as Array<{
    policyId: string;
    ratePercent: number | null;
    customerId: string;
  }>;

  // Map max management fee per policy
  const maxFeeByPolicy = new Map<string, number>();
  for (const mf of mgmtFeeRows) {
    if (mf.ratePercent == null) continue;
    const cur = maxFeeByPolicy.get(mf.policyId) ?? 0;
    if (mf.ratePercent > cur) maxFeeByPolicy.set(mf.policyId, mf.ratePercent);
  }

  // Group policies by customer
  const policyByCustomer = new Map<string, ReasonPolicy[]>();
  for (const p of policyRows) {
    const arr = policyByCustomer.get(p.customerId) ?? [];
    arr.push({
      id: p.id,
      category: p.category,
      status: p.status,
      endDate: p.endDate,
      premiumMonthly: p.premiumMonthly ? Number(p.premiumMonthly) : null,
      premiumAnnual: p.premiumAnnual ? Number(p.premiumAnnual) : null,
      accumulatedSavings: p.accumulatedSavings
        ? Number(p.accumulatedSavings)
        : null,
      managementFeePercent: maxFeeByPolicy.get(p.id) ?? null,
    });
    policyByCustomer.set(p.customerId, arr);
  }

  // Load insights — only unhandled ones (insight status matters; we also re-check in eligibility)
  const insightRows = (await prisma.$queryRawUnsafe(
    `SELECT id, "customerId", category, title, "strengthScore", "urgencyLevel", "linkedRuleId", status
     FROM insights
     WHERE "customerId" = ANY($1)
       AND status NOT IN ('DISMISSED','CONVERTED_TO_RECOMMENDATION','CONVERTED_TO_TASK')`,
    customerIds
  )) as Array<{
    id: string;
    customerId: string;
    category: string;
    title: string;
    strengthScore: number | null;
    urgencyLevel: number;
    linkedRuleId: string | null;
    status: string;
  }>;

  const insightsByCustomer = new Map<string, ReasonInsight[]>();
  for (const i of insightRows) {
    const arr = insightsByCustomer.get(i.customerId) ?? [];
    arr.push({
      id: i.id,
      category: i.category,
      title: i.title,
      strengthScore: i.strengthScore,
      urgencyLevel: i.urgencyLevel,
      linkedRuleId: i.linkedRuleId,
    });
    insightsByCustomer.set(i.customerId, arr);
  }

  // Fetch rule categories so we can resolve each insight's office bucket
  // (רפי's taxonomy: כיסוי / חיסכון / שירות / כללי).
  const ruleIds = Array.from(
    new Set(
      insightRows
        .map((i) => i.linkedRuleId)
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

  // Last contact date — take most recent SENT message timestamp per customer
  const lastContactRows = (await prisma.$queryRawUnsafe(
    `SELECT "customerId", MAX("updatedAt") as last_sent
     FROM message_drafts
     WHERE status = 'SENT' AND "customerId" = ANY($1)
     GROUP BY "customerId"`,
    customerIds
  )) as Array<{ customerId: string; last_sent: Date | null }>;
  const lastContactByCustomer = new Map<string, Date | null>();
  for (const r of lastContactRows) {
    lastContactByCustomer.set(r.customerId, r.last_sent);
  }

  const cache: EligibilityCache = await buildEligibilityCache(settings);

  // Build candidates: one per customer, picking the best eligible insight
  const candidates: Candidate[] = [];

  for (const cust of customerRows) {
    const customerInsights = insightsByCustomer.get(cust.id) ?? [];
    if (customerInsights.length === 0) continue;

    const policies = policyByCustomer.get(cust.id) ?? [];
    const activePolicies = policies.filter((p) => p.status === "ACTIVE");
    const totalMonthlyPremium = activePolicies.reduce(
      (s, p) =>
        s + (p.premiumMonthly ?? 0) + (p.premiumAnnual ? p.premiumAnnual / 12 : 0),
      0
    );
    const totalAccumulatedSavings = activePolicies.reduce(
      (s, p) => s + (p.accumulatedSavings ?? 0),
      0
    );
    const activeCategories = new Set(activePolicies.map((p) => p.category));
    const lastContactAt = lastContactByCustomer.get(cust.id) ?? null;
    const hasPensionPolicy = activePolicies.some((p) => p.category === "PENSION");

    const reasonCustomer: ReasonCustomer = {
      id: cust.id,
      age: cust.age,
      dateOfBirth: cust.dateOfBirth,
      lastReviewDate: cust.lastReviewDate,
      hasPensionPolicy,
      totalSavings: totalAccumulatedSavings,
    };

    let best: Candidate | null = null;

    // Renewals now live in the BAFI lane (/renewals) when the toggle is on.
    // An EXPIRING_POLICY insight can still appear as a supporting topic.
    const primaryCandidates = settings.renewalsLaneEnabled
      ? customerInsights.filter((i) => i.category !== "EXPIRING_POLICY")
      : customerInsights;
    const usable = primaryCandidates.length > 0 ? primaryCandidates : [];

    for (const ins of usable) {
      const ctx: ReasonContext = {
        insight: ins,
        customer: reasonCustomer,
        policies,
        lastContactAt,
        totalMonthlyPremium,
        totalAccumulatedSavings,
        activeCategoryCount: activeCategories.size,
      };

      const critical = isTimeCritical(ctx, settings);
      const elig = await checkEligibility(cust.id, ins.id, ins.linkedRuleId, {
        timeCritical: critical,
        cache,
      });
      if (!elig.eligible) continue;

      const reasonCategory = determineReasonCategory(ctx, settings);
      const whyToday = buildWhyTodayReason(ctx, settings);

      // Compute days-to-expiry for sort (nearest active expiring policy)
      let daysToExpiry: number | null = null;
      for (const p of activePolicies) {
        if (!p.endDate) continue;
        const d = Math.ceil(
          (p.endDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000)
        );
        if (d < 0) continue;
        if (daysToExpiry == null || d < daysToExpiry) daysToExpiry = d;
      }

      const bucket = resolveBucket(
        ins.linkedRuleId ? ruleCategoryById.get(ins.linkedRuleId) : null,
        ins.category
      );
      const priority = computePriority(ctx, bucket, settings);

      const candidate: Candidate = {
        customerId: cust.id,
        primaryInsight: ins,
        supportingInsightIds: [],
        ctx,
        reasonCategory,
        whyToday,
        timeCritical: critical,
        gateResults: elig.gateResults,
        score: priority.score,
        priority,
        daysToExpiry,
      };

      if (!best || candidate.score > best.score) {
        best = candidate;
      }
    }

    if (best) {
      // Supporting insights: top 2 OTHER insights for this customer by strengthScore
      const supporting = customerInsights
        .filter((i) => i.id !== best!.primaryInsight.id)
        .sort((a, b) => (b.strengthScore ?? 0) - (a.strengthScore ?? 0))
        .slice(0, 2)
        .map((i) => i.id);
      best.supportingInsightIds = supporting;
      candidates.push(best);
    }
  }

  // Sort candidates: time-critical first (by days-to-expiry asc),
  // then by score desc.
  candidates.sort((a, b) => {
    if (a.timeCritical && !b.timeCritical) return -1;
    if (!a.timeCritical && b.timeCritical) return 1;
    if (a.timeCritical && b.timeCritical) {
      const da = a.daysToExpiry ?? Number.MAX_SAFE_INTEGER;
      const db = b.daysToExpiry ?? Number.MAX_SAFE_INTEGER;
      if (da !== db) return da - db;
    }
    return b.score - a.score;
  });

  // Allocate TODAY slots: reserve up to N slots for time-critical
  const urgent = candidates.filter((c) => c.timeCritical);
  const nonUrgent = candidates.filter((c) => !c.timeCritical);

  const today: Candidate[] = [];
  const urgentTaken = urgent.slice(0, Math.min(reserveUrgentSlots, capacity));
  today.push(...urgentTaken);

  // Fill remaining with best non-urgent
  const remainingAfterUrgent = capacity - today.length;
  if (remainingAfterUrgent > 0) {
    today.push(...nonUrgent.slice(0, remainingAfterUrgent));
  }

  // If still room (not enough non-urgent), backfill with more urgent
  if (today.length < capacity) {
    const taken = new Set(today.map((c) => c.customerId));
    for (const c of urgent) {
      if (today.length >= capacity) break;
      if (!taken.has(c.customerId)) {
        today.push(c);
        taken.add(c.customerId);
      }
    }
  }

  // SOON: next best candidates not already in TODAY
  const todayIds = new Set(today.map((c) => c.customerId));
  const soon = candidates
    .filter((c) => !todayIds.has(c.customerId))
    .slice(0, SOON_CAPACITY);

  // Persist
  await persistLane(today, "TODAY", queueDate, assignedUserId, reason);
  await persistLane(soon, "SOON", queueDate, assignedUserId, reason);

  return { today: today.length, soon: soon.length };
}

async function persistLane(
  candidates: Candidate[],
  lane: "TODAY" | "SOON",
  queueDate: Date,
  assignedUserId: string | null,
  reason: GenerationReason
): Promise<void> {
  if (candidates.length === 0) return;

  // Use createMany — all fields are primitives / JSON
  await prisma.queueEntry.createMany({
    data: candidates.map((c, idx) => ({
      queueDate,
      lane,
      rank: idx + 1,
      customerId: c.customerId,
      primaryInsightId: c.primaryInsight.id,
      supportingInsightIds: c.supportingInsightIds,
      whyTodayReason: c.whyToday,
      reasonCategory: c.reasonCategory,
      assignedUserId,
      generationReason: reason,
      generationVersion: 1,
      debugContext: {
        gateResults: c.gateResults,
        score: c.score,
        priorityScore: c.priority.score,
        priorityBreakdown: {
          bucket: c.priority.bucket,
          bucketFloor: c.priority.bucketFloor,
          strengthBonus: c.priority.strengthBonus,
          valueBonus: c.priority.valueBonus,
          renewalPenalty: c.priority.renewalPenalty,
        },
        timeCritical: c.timeCritical,
        daysToExpiry: c.daysToExpiry,
        primaryInsightCategory: c.primaryInsight.category,
        strengthScore: c.primaryInsight.strengthScore,
        urgencyLevel: c.primaryInsight.urgencyLevel,
      },
      status: "PENDING",
    })),
    skipDuplicates: true,
  });
}

/**
 * Promote the best SOON entry to TODAY after a TODAY slot opens up
 * (e.g., when an entry is completed or dismissed).
 */
export async function promoteFromSoon(
  queueDate: Date,
  assignedUserId: string | null
): Promise<QueueEntry | null> {
  // Find oldest PENDING SOON for this assignee/date, ordered by rank
  const candidate = await prisma.queueEntry.findFirst({
    where: {
      queueDate,
      assignedUserId,
      lane: "SOON",
      status: "PENDING",
    },
    orderBy: { rank: "asc" },
    include: {
      primaryInsight: { select: { id: true, linkedRuleId: true } },
    },
  });

  if (!candidate) return null;

  // Re-check eligibility (things may have changed since build)
  const insightId = candidate.primaryInsightId;
  const ruleId = candidate.primaryInsight?.linkedRuleId ?? null;
  if (!insightId) return null;

  const timeCritical =
    candidate.reasonCategory === "URGENT_EXPIRY" ||
    candidate.reasonCategory === "AGE_MILESTONE";

  const elig = await checkEligibility(
    candidate.customerId,
    insightId,
    ruleId,
    { timeCritical }
  );

  if (!elig.eligible) {
    // Mark it BLOCKED so we don't try again; return null so caller can
    // invoke promoteFromSoon again to try the next candidate.
    await prisma.queueEntry.update({
      where: { id: candidate.id },
      data: {
        status: "BLOCKED",
        actionNote: "Eligibility failed during promotion",
        debugContext: {
          ...(typeof candidate.debugContext === "object" &&
          candidate.debugContext !== null
            ? (candidate.debugContext as Record<string, unknown>)
            : {}),
          promotionBlockedAt: new Date().toISOString(),
          promotionGateResults: elig.gateResults,
        },
      },
    });
    return null;
  }

  // Find next rank for TODAY lane for this assignee/date
  const maxTodayRank = await prisma.queueEntry.aggregate({
    where: {
      queueDate,
      assignedUserId,
      lane: "TODAY",
    },
    _max: { rank: true },
  });
  const nextRank = (maxTodayRank._max.rank ?? 0) + 1;

  const promoted = await prisma.queueEntry.update({
    where: { id: candidate.id },
    data: {
      lane: "TODAY",
      rank: nextRank,
      generationReason: "INCREMENTAL_FILL",
    },
  });

  return promoted;
}
