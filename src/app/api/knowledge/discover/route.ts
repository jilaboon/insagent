import { NextRequest, NextResponse } from "next/server";
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

    return NextResponse.json({ articles: output.articles });
  } catch (error) {
    console.error("Article discovery failed:", error);
    return NextResponse.json(
      { error: "Failed to discover articles" },
      { status: 500 }
    );
  }
}
