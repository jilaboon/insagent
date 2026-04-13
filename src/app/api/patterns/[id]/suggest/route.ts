import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateText, Output } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";

export const maxDuration = 60;

const SuggestedTipSchema = z.object({
  title: z.string().describe("כותרת קצרה בעברית"),
  body: z.string().describe("תוכן הטיפ — 2-3 משפטים מעשיים"),
  category: z
    .enum(["חידוש", "כיסוי", "חיסכון", "שירות", "כללי"])
    .describe("קטגוריית הטיפ"),
  triggerHint: z.string().describe("מתי להשתמש בטיפ"),
});

const SYSTEM_PROMPT = `You are an expert Israeli insurance advisor working at an insurance agency.
A data pattern was found in the office's customer base. Write a practical tip that the agency can use.

Rules:
- Write in perfect Hebrew
- The tip should be actionable and directly valuable for the agent's work
- Focus on what the agent should DO with this information
- Be specific about the insurance context (Israeli market)
- NEVER include customer names, IDs, or any personally identifiable information
- Keep the title short (under 50 characters)
- Keep the body to 2-3 sentences maximum
- The triggerHint should describe when to use this tip (e.g. "בפגישה עם לקוח שיש לו רק ביטוח רכב")`;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { patternTitle, patternDescription, count } = body;

    if (!patternTitle || !patternDescription) {
      return NextResponse.json(
        { error: "patternTitle and patternDescription are required" },
        { status: 400 }
      );
    }

    // Load existing tips to avoid duplicates
    const existingTips = await prisma.officeTip.findMany({
      select: { title: true, body: true },
    });

    const existingTipsSummary = existingTips
      .map((t) => `- ${t.title}`)
      .join("\n");

    const prompt = `דפוס נתונים שנמצא במערכת:
מזהה: ${id}
כותרת: ${patternTitle}
תיאור: ${patternDescription}
מספר לקוחות: ${count}

טיפים קיימים (אל תחזור עליהם):
${existingTipsSummary || "(אין טיפים קיימים)"}

כתוב טיפ מעשי אחד שהסוכן יכול להשתמש בו על סמך הדפוס הזה.`;

    const result = await generateText({
      model: anthropic("claude-haiku-4-5-20251001"),
      output: Output.object({ schema: SuggestedTipSchema }),
      system: SYSTEM_PROMPT,
      prompt,
    });

    const output = result.output;
    if (!output) {
      return NextResponse.json(
        { error: "AI did not return a suggestion" },
        { status: 500 }
      );
    }

    // Hebrew quality review with Sonnet
    const { reviewHebrewBatch } = await import("@/lib/ai/hebrew-review");
    const reviewed = await reviewHebrewBatch([output.title, output.body]);

    return NextResponse.json({
      ...output,
      title: reviewed[0] || output.title,
      body: reviewed[1] || output.body,
    });
  } catch (error) {
    console.error("Pattern suggest failed:", error);
    return NextResponse.json(
      { error: "Failed to generate suggestion" },
      { status: 500 }
    );
  }
}
