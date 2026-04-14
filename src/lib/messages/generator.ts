/**
 * WhatsApp Message Generator (Layer 3)
 *
 * Generates personalized Hebrew WhatsApp messages from insights.
 */

import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { prisma } from "@/lib/db";
import { MESSAGE_SYSTEM_PROMPT, buildMessageUserPrompt, buildCombinedMessagePrompt, buildTipsContext } from "@/lib/ai/prompts/message-system";
import { sanitizeEvidenceForAI } from "@/lib/ai/sanitize";

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
    // Sanitize evidence — strip PII before sending to AI
    relevantData: sanitizeEvidenceForAI(
      (insight.evidenceJson as Record<string, unknown>) || {}
    ),
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
 * Generate a single combined WhatsApp message from multiple insights for the same customer.
 * All insights must belong to the same customer.
 */
export async function generateCombinedMessage(
  insightIds: string[],
  agentName: string = DEFAULT_AGENT_NAME
): Promise<{ messageId: string; body: string } | null> {
  if (insightIds.length === 0) return null;
  if (insightIds.length === 1) return generateMessage(insightIds[0], agentName);

  // Load all insights with customer data
  const insights = await prisma.insight.findMany({
    where: { id: { in: insightIds } },
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

  if (insights.length === 0) return null;

  // Validate all insights belong to the same customer
  const customerIds = new Set(insights.map((i) => i.customerId));
  if (customerIds.size > 1) {
    console.error("generateCombinedMessage: insights belong to different customers");
    return null;
  }

  const customer = insights[0].customer;
  const genderMap: Record<string, "male" | "female" | "unknown"> = {
    "זכר": "male",
    "נקבה": "female",
  };
  const customerGender = genderMap[customer.gender || ""] || "unknown";

  const prompt = buildCombinedMessagePrompt({
    customerFirstName: customer.firstName,
    customerGender,
    agentName,
    insights: insights.map((i) => ({
      title: i.title,
      summary: i.summary,
      explanation: i.explanation || i.summary,
      // Sanitize evidence — strip PII before sending to AI
      relevantData: sanitizeEvidenceForAI(
        (i.evidenceJson as Record<string, unknown>) || {}
      ),
    })),
  });

  try {
    // Load active office rules for context
    const activeRules = await prisma.officeRule.findMany({
      where: { isActive: true },
      select: { title: true, body: true },
    });
    const tipsContext = buildTipsContext(activeRules);
    const systemPrompt = MESSAGE_SYSTEM_PROMPT + tipsContext;

    const result = await generateText({
      model: anthropic("claude-sonnet-4-20250514"),
      system: systemPrompt,
      prompt,
    });

    const rawBody = result.text.trim();

    const { reviewHebrew } = await import("@/lib/ai/hebrew-review");
    const body = await reviewHebrew(rawBody);

    const purpose = categorizePurpose(insights[0].category);

    // Save one message draft linked to the first insight
    const draft = await prisma.messageDraft.create({
      data: {
        customerId: customer.id,
        insightId: insights[0].id,
        body,
        tone: "professional",
        purpose,
        status: "DRAFT",
        generatedBy: "AI",
      },
    });

    return { messageId: draft.id, body };
  } catch (error) {
    console.error("Combined message generation failed:", error);
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
