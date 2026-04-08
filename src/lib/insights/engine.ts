/**
 * Insight Engine Orchestrator
 *
 * Coordinates all 3 layers of insight generation:
 * 1. Deterministic rules (fast, reliable)
 * 2. AI-generated insights (slower, creative)
 * 3. Scoring and persistence
 */

import { prisma } from "@/lib/db";
import { buildCustomerProfile, buildAllProfiles } from "./profile-builder";
import { allRules } from "./rules/all-rules";
import { computeScore } from "./scorer";
import { generateAIInsights } from "./ai-insights";
import type { CustomerProfile, RuleResult } from "./rules/types";

// ============================================================
// Generate insights for a single customer
// ============================================================

export async function generateInsightsForCustomer(
  customerId: string,
  options: { includeAI?: boolean } = {}
): Promise<{ deterministic: number; ai: number; total: number }> {
  const profile = await buildCustomerProfile(customerId);
  if (!profile) return { deterministic: 0, ai: 0, total: 0 };

  return processProfile(profile, options);
}

// ============================================================
// Generate insights for ALL customers
// ============================================================

export async function generateInsightsForAll(
  options: {
    includeAI?: boolean;
    onProgress?: (processed: number, total: number) => void;
  } = {}
): Promise<{ totalCustomers: number; totalInsights: number; deterministicCount: number; aiCount: number }> {
  const profiles = await buildAllProfiles();
  let totalInsights = 0;
  let deterministicCount = 0;
  let aiCount = 0;

  for (let i = 0; i < profiles.length; i++) {
    const result = await processProfile(profiles[i], options);
    totalInsights += result.total;
    deterministicCount += result.deterministic;
    aiCount += result.ai;

    options.onProgress?.(i + 1, profiles.length);
  }

  return {
    totalCustomers: profiles.length,
    totalInsights,
    deterministicCount,
    aiCount,
  };
}

// ============================================================
// Process a single profile through all layers
// ============================================================

async function processProfile(
  profile: CustomerProfile,
  options: { includeAI?: boolean } = {}
): Promise<{ deterministic: number; ai: number; total: number }> {
  const customerId = profile.customer.id;
  let deterministicCount = 0;
  let aiCount = 0;

  // Layer 1: Run all deterministic rules
  const ruleResults: RuleResult[] = [];
  for (const rule of allRules) {
    try {
      const result = rule.evaluate(profile);
      if (result) {
        ruleResults.push(result);
      }
    } catch {
      // Skip failed rules silently
    }
  }

  // Persist deterministic insights
  for (const result of ruleResults) {
    const score = computeScore(result.scoringHints);

    // Check if this rule already generated an insight for this customer
    const existing = await prisma.insight.findFirst({
      where: {
        customerId,
        linkedRuleId: result.ruleId,
      },
    });

    if (existing) {
      // Update existing insight with fresh score
      await prisma.insight.update({
        where: { id: existing.id },
        data: {
          title: result.title,
          summary: result.summary,
          explanation: result.explanation,
          whyNow: result.whyNow,
          urgencyLevel: result.urgencyLevel,
          strengthScore: score,
          branch: result.branch,
          evidenceJson: result.evidence as object,
          updatedAt: new Date(),
        },
      });
    } else {
      await prisma.insight.create({
        data: {
          customerId,
          category: result.category,
          title: result.title,
          summary: result.summary,
          explanation: result.explanation,
          whyNow: result.whyNow,
          urgencyLevel: result.urgencyLevel,
          dataFreshness: profile.activePolicies.length > 0 ? 2 : 0,
          profileCompleteness: computeProfileCompleteness(profile),
          strengthScore: score,
          branch: result.branch,
          evidenceJson: result.evidence as object,
          generatedBy: "DETERMINISTIC",
          linkedRuleId: result.ruleId,
        },
      });
    }

    deterministicCount++;
  }

  // Layer 2: AI-generated insights (optional)
  if (options.includeAI && profile.activePolicies.length >= 2) {
    try {
      const existingTitles = ruleResults.map((r) => r.title);
      const aiResults = await generateAIInsights(profile, existingTitles);

      for (const aiResult of aiResults) {
        await prisma.insight.create({
          data: {
            customerId,
            category: "AI_GENERATED",
            title: aiResult.title,
            summary: aiResult.summary,
            explanation: aiResult.explanation,
            whyNow: aiResult.whyNow,
            urgencyLevel: aiResult.urgencyLevel,
            dataFreshness: profile.activePolicies.length > 3 ? 2 : 1,
            profileCompleteness: computeProfileCompleteness(profile),
            strengthScore: aiResult.strengthScore,
            branch: profile.hasElementaryBranch && !profile.hasLifeBranch ? "ELEMENTARY" : "LIFE",
            evidenceJson: aiResult.evidence as object,
            generatedBy: "AI",
          },
        });
        aiCount++;
      }
    } catch {
      // AI failure shouldn't block deterministic insights
    }
  }

  return {
    deterministic: deterministicCount,
    ai: aiCount,
    total: deterministicCount + aiCount,
  };
}

// ============================================================
// Helpers
// ============================================================

function computeProfileCompleteness(profile: CustomerProfile): number {
  let score = 0;
  const c = profile.customer;

  if (c.firstName) score += 1;
  if (c.phone) score += 1;
  if (c.email) score += 1;
  if (c.address) score += 1;
  if (c.age) score += 1;
  if (profile.activePolicies.length > 0) score += 1;
  if (profile.activePolicies.length > 3) score += 1;
  if (profile.hasLifeBranch && profile.hasElementaryBranch) score += 1;

  // 0-2 scale: 0=low (0-2), 1=medium (3-5), 2=high (6+)
  if (score >= 6) return 2;
  if (score >= 3) return 1;
  return 0;
}
