/**
 * WhatsApp Message Generator (Layer 3)
 *
 * Generates personalized Hebrew WhatsApp messages from insights.
 */

import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { prisma } from "@/lib/db";
import { MESSAGE_SYSTEM_PROMPT, buildMessageUserPrompt, buildTipsContext } from "@/lib/ai/prompts/message-system";

const DEFAULT_AGENT_NAME = "רפי";

/**
 * Generate a personalized WhatsApp message for a specific insight.
 */
export async function generateMessage(
  insightId: string,
  agentName: string = DEFAULT_AGENT_NAME
): Promise<{ messageId: string; body: string } | null> {
  // Load insight with customer data
  const insight = await prisma.insight.findUnique({
    where: { id: insightId },
    include: {
      customer: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          age: true,
          gender: true,
        },
      },
    },
  });

  if (!insight) return null;

  // Map gender from Hebrew to prompt instruction
  const genderMap: Record<string, "male" | "female" | "unknown"> = {
    "זכר": "male",
    "נקבה": "female",
  };
  const customerGender = genderMap[insight.customer.gender || ""] || "unknown";

  const prompt = buildMessageUserPrompt({
    customerFirstName: insight.customer.firstName,
    customerGender,
    agentName,
    insightTitle: insight.title,
    insightSummary: insight.summary,
    insightExplanation: insight.explanation || insight.summary,
    relevantData: (insight.evidenceJson as Record<string, unknown>) || {},
  });

  try {
    // Load active office tips for context
    const activeTips = await prisma.officeTip.findMany({
      where: { isActive: true },
      select: { title: true, body: true },
    });
    const tipsContext = buildTipsContext(activeTips);
    const systemPrompt = MESSAGE_SYSTEM_PROMPT + tipsContext;

    const result = await generateText({
      model: anthropic("claude-sonnet-4-20250514"),
      system: systemPrompt,
      prompt,
    });

    const rawBody = result.text.trim();

    // Second pass: Hebrew grammar and quality check via shared reviewer
    const { reviewHebrew } = await import("@/lib/ai/hebrew-review");
    const body = await reviewHebrew(rawBody);

    // Determine purpose from insight category
    const purpose = categorizePurpose(insight.category);

    // Save to database
    const draft = await prisma.messageDraft.create({
      data: {
        customerId: insight.customer.id,
        insightId: insight.id,
        body,
        tone: "professional",
        purpose,
        status: "DRAFT",
        generatedBy: "AI",
      },
    });

    return { messageId: draft.id, body };
  } catch (error) {
    console.error("Message generation failed:", error);
    return null;
  }
}

/**
 * Generate messages for multiple insights in bulk.
 */
export async function generateMessagesForInsights(
  insightIds: string[],
  agentName: string = DEFAULT_AGENT_NAME
): Promise<{ generated: number; failed: number }> {
  let generated = 0;
  let failed = 0;

  for (const insightId of insightIds) {
    const result = await generateMessage(insightId, agentName);
    if (result) generated++;
    else failed++;
  }

  return { generated, failed };
}

function categorizePurpose(category: string): string {
  switch (category) {
    case "EXPIRING_POLICY":
      return "renewal";
    case "CROSS_SELL_OPPORTUNITY":
    case "SINGLE_CATEGORY":
    case "NO_HEALTH":
    case "NO_PROPERTY":
      return "cross-sell";
    case "MANAGEMENT_FEE_HIGH":
    case "POLICY_AGE_REVIEW":
    case "PREMIUM_CONCENTRATION":
      return "optimization";
    case "AGE_MILESTONE":
    case "COVERAGE_GAP":
    case "HIGH_SAVINGS_LOW_PROTECTION":
      return "service";
    default:
      return "tip";
  }
}
