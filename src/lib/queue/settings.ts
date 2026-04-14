/**
 * Queue algorithm settings — stored as a single JSON row in SystemSetting
 * under key "queueSettings". Allows רפי to tune the daily queue builder
 * without code changes.
 *
 * Reads are merged with DEFAULT_SETTINGS so adding new fields in code
 * never breaks existing deployments.
 */

import { prisma } from "@/lib/db";

export interface QueueSettings {
  /** How many customers appear in the daily TODAY lane. */
  dailyCapacity: number;
  /** Slots reserved for time-critical items (age milestones). */
  urgentReserveSlots: number;
  /** Ages that trigger the AGE_MILESTONE reason. */
  ageMilestones: number[];
  /** How long (days) after the milestone the opportunity stays relevant. */
  milestoneFreshnessDays: number;
  /** If true, milestone only fires when the customer has pension or meaningful savings. */
  milestoneRequiresPensionOrSavings: boolean;
  /** Minimum accumulated savings for the above check. */
  milestoneMinSavings: number;
  /** Total savings threshold to flag a HIGH_VALUE customer. */
  highValueSavingsThreshold: number;
  /** Monthly premium threshold to flag a HIGH_VALUE customer. */
  highValueMonthlyPremiumThreshold: number;
  /** Management fee % above which cost optimization kicks in. */
  managementFeeThreshold: number;
  /** Min accumulated savings for cost optimization to be worth a call. */
  costOptimizationMinSavings: number;
  /** Days to suppress a customer after a queue entry was DISMISSED. */
  cooldownAfterDismissalDays: number;
  /** Days after a SENT message before we re-surface the same customer. */
  recentContactSuppressionDays: number;
}

export const DEFAULT_SETTINGS: QueueSettings = {
  dailyCapacity: 20,
  urgentReserveSlots: 8,
  ageMilestones: [60],
  milestoneFreshnessDays: 30,
  milestoneRequiresPensionOrSavings: true,
  milestoneMinSavings: 50_000,
  highValueSavingsThreshold: 500_000,
  highValueMonthlyPremiumThreshold: 1_500,
  managementFeeThreshold: 1.5,
  costOptimizationMinSavings: 100_000,
  cooldownAfterDismissalDays: 60,
  recentContactSuppressionDays: 30,
};

const SETTING_KEY = "queueSettings";

/** Read settings from the DB and merge with defaults for forward compatibility. */
export async function getQueueSettings(): Promise<QueueSettings> {
  const row = await prisma.systemSetting.findUnique({
    where: { key: SETTING_KEY },
    select: { value: true },
  });

  if (!row) return { ...DEFAULT_SETTINGS };

  try {
    const parsed = JSON.parse(row.value) as Partial<QueueSettings>;
    return mergeSettings(DEFAULT_SETTINGS, parsed);
  } catch {
    // Corrupt row — fall back to defaults rather than crashing the queue.
    return { ...DEFAULT_SETTINGS };
  }
}

/** Merge a partial patch into existing settings and persist. */
export async function updateQueueSettings(
  patch: Partial<QueueSettings>
): Promise<QueueSettings> {
  const current = await getQueueSettings();
  const next = mergeSettings(current, patch);

  const value = JSON.stringify(next);

  await prisma.systemSetting.upsert({
    where: { key: SETTING_KEY },
    create: { key: SETTING_KEY, value },
    update: { value },
  });

  return next;
}

function mergeSettings(
  base: QueueSettings,
  patch: Partial<QueueSettings>
): QueueSettings {
  const merged: QueueSettings = { ...base };
  for (const k of Object.keys(patch) as (keyof QueueSettings)[]) {
    const v = patch[k];
    if (v === undefined || v === null) continue;
    // Type narrowing via assignment
    (merged as unknown as Record<string, unknown>)[k] = v;
  }
  // Normalize ageMilestones — dedupe, sort, filter out invalid ages
  if (Array.isArray(merged.ageMilestones)) {
    merged.ageMilestones = Array.from(
      new Set(merged.ageMilestones.filter((a) => Number.isFinite(a) && a > 0))
    ).sort((a, b) => a - b);
  }
  // Urgent reserve cannot exceed capacity
  if (merged.urgentReserveSlots > merged.dailyCapacity) {
    merged.urgentReserveSlots = merged.dailyCapacity;
  }
  return merged;
}
