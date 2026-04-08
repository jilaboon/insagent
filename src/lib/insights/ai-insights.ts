/**
 * AI Insight Generation (Layer 2)
 *
 * Uses the Vercel AI SDK to generate additional insights
 * beyond what deterministic rules can find.
 */

import { generateText, Output } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { INSIGHT_SYSTEM_PROMPT, buildInsightUserPrompt } from "@/lib/ai/prompts/insight-system";
import { computeAIInsightHints, computeScore } from "./scorer";
import type { CustomerProfile } from "./rules/types";

// ============================================================
// Schema for structured AI output
// ============================================================

const AIInsightSchema = z.object({
  insights: z.array(
    z.object({
      title: z.string().describe("כותרת קצרה בעברית"),
      summary: z.string().describe("משפט אחד מסביר"),
      explanation: z.string().describe("הסבר מפורט עם נתונים"),
      whyNow: z.string().describe("למה עכשיו"),
      urgencyLevel: z.number().min(0).max(2).describe("0=נמוך, 1=בינוני, 2=גבוה"),
      estimatedFinancialImpact: z.enum(["low", "medium", "high"]),
      evidence: z.record(z.string(), z.unknown()).describe("נתונים שהובילו לתובנה"),
    })
  ).max(3),
});

export type AIInsightResult = z.infer<typeof AIInsightSchema>["insights"][number];

// ============================================================
// Generate insights for a single customer
// ============================================================

export async function generateAIInsights(
  profile: CustomerProfile,
  existingInsightTitles: string[]
): Promise<Array<AIInsightResult & { strengthScore: number }>> {
  const customerName = `${profile.customer.firstName} ${profile.customer.lastName}`.trim();

  const userPrompt = buildInsightUserPrompt({
    customerName,
    age: profile.customer.age,
    maritalStatus: profile.customer.maritalStatus,
    policies: profile.activePolicies.map((p) => ({
      category: p.category,
      subType: p.subType,
      insurer: p.insurer,
      status: p.status,
      premiumMonthly: p.premiumMonthly,
      premiumAnnual: p.premiumAnnual,
      accumulatedSavings: p.accumulatedSavings,
      startDate: p.startDate?.toISOString().split("T")[0] || null,
      endDate: p.endDate?.toISOString().split("T")[0] || null,
      vehicleYear: p.vehicleYear,
      managementFees: (p.managementFees || []).map((f) => ({
        feeType: f.feeType,
        ratePercent: f.ratePercent,
      })),
    })),
    existingInsights: existingInsightTitles,
  });

  try {
    const result = await generateText({
      model: anthropic("claude-haiku-4.5"),
      output: Output.object({ schema: AIInsightSchema }),
      system: INSIGHT_SYSTEM_PROMPT,
      prompt: userPrompt,
    });

    const output = result.output;
    if (!output) return [];

    return output.insights.map((insight) => {
      const hints = computeAIInsightHints({
        estimatedFinancialImpact: insight.estimatedFinancialImpact,
        urgencyLevel: insight.urgencyLevel as 0 | 1 | 2,
        evidenceCount: Object.keys(insight.evidence || {}).length,
        dataFreshness: profile.activePolicies.length > 3 ? 2 : 1,
      });

      return {
        ...insight,
        strengthScore: computeScore(hints),
      };
    });
  } catch (error) {
    console.error("AI insight generation failed:", error);
    return [];
  }
}
