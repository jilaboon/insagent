import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { buildCustomerProfile } from "@/lib/insights/profile-builder";
import { allRules } from "@/lib/insights/rules/all-rules";
import { computeScore } from "@/lib/insights/scorer";

export const maxDuration = 300;

/**
 * Batch insight generation.
 * Body: { offset, limit, includeAI? }
 *
 * Client calls this repeatedly with increasing offset until all customers processed.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { offset = 0, limit = 100, includeAI = false } = body as {
      offset?: number;
      limit?: number;
      includeAI?: boolean;
    };

    // Get batch of customers
    const customers = await prisma.customer.findMany({
      skip: offset,
      take: limit,
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });

    const totalCustomers = await prisma.customer.count();

    let insightsCreated = 0;

    for (const { id: customerId } of customers) {
      const profile = await buildCustomerProfile(customerId);
      if (!profile) continue;

      // Run all deterministic rules
      for (const rule of allRules) {
        try {
          const result = rule.evaluate(profile);
          if (!result) continue;

          const score = computeScore(result.scoringHints);

          // Upsert: skip if same rule already generated for this customer
          const existing = await prisma.insight.findFirst({
            where: { customerId, linkedRuleId: result.ruleId },
            select: { id: true },
          });

          if (!existing) {
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
                profileCompleteness: profile.activePolicies.length >= 3 ? 2 : profile.activePolicies.length >= 1 ? 1 : 0,
                strengthScore: score,
                branch: result.branch,
                evidenceJson: result.evidence as object,
                generatedBy: "DETERMINISTIC",
                linkedRuleId: result.ruleId,
              },
            });
            insightsCreated++;
          }
        } catch {
          // Skip failed rules
        }
      }

      // AI insights — only if requested (expensive)
      if (includeAI && profile.activePolicies.length >= 2) {
        try {
          const { generateAIInsights } = await import("@/lib/insights/ai-insights");
          const existingTitles = (await prisma.insight.findMany({
            where: { customerId },
            select: { title: true },
          })).map(i => i.title);

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
                dataFreshness: 2,
                profileCompleteness: 2,
                strengthScore: aiResult.strengthScore,
                branch: "LIFE",
                evidenceJson: aiResult.evidence as object,
                generatedBy: "AI",
              },
            });
            insightsCreated++;
          }
        } catch {
          // AI failure doesn't block deterministic
        }
      }
    }

    return NextResponse.json({
      processed: customers.length,
      insightsCreated,
      offset,
      totalCustomers,
      done: offset + customers.length >= totalCustomers,
    });
  } catch (error) {
    console.error("Insight generation error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "שגיאה ביצירת תובנות" },
      { status: 500 }
    );
  }
}
