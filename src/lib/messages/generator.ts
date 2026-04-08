/**
 * WhatsApp Message Generator (Layer 3)
 *
 * Generates personalized Hebrew WhatsApp messages from insights.
 */

import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { prisma } from "@/lib/db";
import { MESSAGE_SYSTEM_PROMPT, buildMessageUserPrompt } from "@/lib/ai/prompts/message-system";

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
        },
      },
    },
  });

  if (!insight) return null;

  const prompt = buildMessageUserPrompt({
    customerFirstName: insight.customer.firstName,
    agentName,
    insightTitle: insight.title,
    insightSummary: insight.summary,
    insightExplanation: insight.explanation || insight.summary,
    relevantData: (insight.evidenceJson as Record<string, unknown>) || {},
  });

  try {
    const result = await generateText({
      model: anthropic("claude-haiku-4.5"),
      system: MESSAGE_SYSTEM_PROMPT,
      prompt,
    });

    const body = result.text.trim();

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
