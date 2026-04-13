import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateText, Output } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import {
  KNOWLEDGE_EXTRACTION_SYSTEM_PROMPT,
  buildKnowledgeExtractionUserPrompt,
} from "@/lib/ai/prompts/knowledge-extraction-system";

export const maxDuration = 120;

const ExtractedTipsSchema = z.object({
  tips: z.array(
    z.object({
      title: z.string().describe("כותרת קצרה בעברית"),
      body: z.string().describe("תוכן הטיפ — 2-3 משפטים"),
      category: z
        .enum(["חידוש", "כיסוי", "חיסכון", "שירות", "כללי"])
        .describe("קטגוריית הטיפ"),
      triggerHint: z.string().describe("מתי להשתמש בטיפ"),
      relevance: z.string().describe("למה זה רלוונטי למשרד"),
      estimatedCustomers: z
        .string()
        .describe("הערכת מספר לקוחות רלוונטיים"),
    })
  ),
});

export type ExtractedTip = z.infer<
  typeof ExtractedTipsSchema
>["tips"][number];

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const article = await prisma.knowledgeArticle.findUnique({
      where: { id },
    });

    if (!article) {
      return NextResponse.json(
        { error: "Article not found" },
        { status: 404 }
      );
    }

    // Load aggregate stats and existing tips in parallel — NO customer PII
    const [categoryGroups, totalCustomers, existingTips] = await Promise.all([
      prisma.policy.groupBy({
        by: ["category"],
        _count: { id: true },
        where: { status: "ACTIVE" },
      }),
      prisma.customer.count(),
      prisma.officeTip.findMany({
        select: { title: true, body: true, category: true },
      }),
    ]);

    const categoryDistribution: Record<string, number> = {};
    for (const g of categoryGroups) {
      categoryDistribution[g.category] = g._count.id;
    }

    const userPrompt = buildKnowledgeExtractionUserPrompt({
      articleTitle: article.title,
      articleContent: article.content,
      aggregateStats: {
        totalCustomers,
        categoryDistribution,
      },
      existingTips,
    });

    const result = await generateText({
      model: anthropic("claude-haiku-4-5-20251001"),
      output: Output.object({ schema: ExtractedTipsSchema }),
      system: KNOWLEDGE_EXTRACTION_SYSTEM_PROMPT,
      prompt: userPrompt,
    });

    const output = result.output;
    if (!output) {
      return NextResponse.json(
        { error: "AI did not return tips" },
        { status: 500 }
      );
    }

    // Update the article's tipsExtracted count
    await prisma.knowledgeArticle.update({
      where: { id },
      data: { tipsExtracted: output.tips.length },
    });

    return NextResponse.json({ tips: output.tips });
  } catch (error) {
    console.error("Knowledge extraction failed:", error);
    return NextResponse.json(
      { error: "Failed to extract tips from article" },
      { status: 500 }
    );
  }
}
