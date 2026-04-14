import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireRole } from "@/lib/auth";
import { checkRateLimit, AI_RATE_LIMITS, rateLimitKey } from "@/lib/rate-limit";
import { generateText, Output } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import {
  ARTICLE_DISCOVERY_SYSTEM_PROMPT,
  buildArticleDiscoveryUserPrompt,
} from "@/lib/ai/prompts/article-discovery-system";

export const maxDuration = 120;

const DiscoveredArticlesSchema = z.object({
  articles: z.array(
    z.object({
      title: z.string().describe("כותרת המאמר בעברית"),
      summary: z.string().describe("תקציר של 2-3 משפטים"),
      content: z.string().describe("תוכן מפורט — 1-2 פסקאות"),
      source: z.string().describe("קישור או מבוסס על ידע מקצועי"),
      relevance: z.string().describe("למה זה רלוונטי למשרד ביטוח"),
    })
  ),
});

export async function POST(request: NextRequest) {
  const { response: authResponse, email, role } = await requireAuth();
  if (authResponse) return authResponse;

  const roleResponse = requireRole(role, ["OWNER", "MANAGER", "ADMIN"]);
  if (roleResponse) return roleResponse;

  const rl = checkRateLimit(
    rateLimitKey("knowledgeDiscover", email),
    AI_RATE_LIMITS.knowledgeDiscover
  );
  if (rl.limited) {
    return NextResponse.json(
      { error: "חרגת ממגבלת הבקשות — נסה שוב בעוד דקה" },
      { status: 429 }
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const topic = body.topic as string | undefined;

    const result = await generateText({
      model: anthropic("claude-haiku-4-5-20251001"),
      output: Output.object({ schema: DiscoveredArticlesSchema }),
      system: ARTICLE_DISCOVERY_SYSTEM_PROMPT,
      prompt: buildArticleDiscoveryUserPrompt(topic),
    });

    const output = result.output;
    if (!output) {
      return NextResponse.json(
        { error: "AI did not return articles" },
        { status: 500 }
      );
    }

    // Hebrew quality review on all article texts
    const { reviewHebrewBatch } = await import("@/lib/ai/hebrew-review");
    const textsToReview = output.articles.flatMap((a) => [a.title, a.summary, a.content]);
    const reviewed = await reviewHebrewBatch(textsToReview);

    const articles = output.articles.map((a, i) => ({
      ...a,
      title: reviewed[i * 3] || a.title,
      summary: reviewed[i * 3 + 1] || a.summary,
      content: reviewed[i * 3 + 2] || a.content,
    }));

    return NextResponse.json({ articles });
  } catch (error) {
    console.error("Article discovery failed:", error);
    return NextResponse.json(
      { error: "Failed to discover articles" },
      { status: 500 }
    );
  }
}
