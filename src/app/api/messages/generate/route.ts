import { NextRequest, NextResponse } from "next/server";
import { generateMessage, generateMessagesForInsights, generateCombinedMessage } from "@/lib/messages/generator";
import { requireAuth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { messageGenerateSchema, validateBody } from "@/lib/validation";
import { checkRateLimit, AI_RATE_LIMITS, rateLimitKey } from "@/lib/rate-limit";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const { response: authResponse, email } = await requireAuth();
  if (authResponse) return authResponse;

  // Rate limit
  const rl = checkRateLimit(
    rateLimitKey("messageGenerate", email),
    AI_RATE_LIMITS.messageGenerate
  );
  if (rl.limited) {
    return NextResponse.json(
      { error: "יותר מדי בקשות — נסו שוב בעוד דקה" },
      { status: 429 }
    );
  }

  try {
    const rawBody = await request.json();
    const validation = validateBody(messageGenerateSchema, rawBody);
    if (!validation.success) return validation.response;

    const { insightId, insightIds, agentName, combined } = validation.data;

    // Single insight message
    if (insightId && !insightIds) {
      const result = await generateMessage(insightId, agentName);
      if (!result) {
        return NextResponse.json({ error: "לא ניתן ליצור הודעה" }, { status: 400 });
      }
      await logAudit({
        actorEmail: email,
        action: "message_generated",
        entityType: "message",
        entityId: result.messageId,
        details: { insightId },
      });
      return NextResponse.json(result);
    }

    // Multiple insights
    if (insightIds && Array.isArray(insightIds)) {
      // Combined mode: merge all insights into one message
      if (combined) {
        const result = await generateCombinedMessage(insightIds, agentName);
        if (!result) {
          return NextResponse.json({ error: "לא ניתן ליצור הודעה משולבת" }, { status: 400 });
        }
        await logAudit({
          actorEmail: email,
          action: "message_generated",
          entityType: "message",
          entityId: result.messageId,
          details: { insightIds, combined: true },
        });
        return NextResponse.json(result);
      }

      // Separate mode: one message per insight
      const result = await generateMessagesForInsights(insightIds, agentName);
      await logAudit({
        actorEmail: email,
        action: "message_generated",
        entityType: "message",
        details: { insightIds, generated: result.generated },
      });
      return NextResponse.json({
        message: `נוצרו ${result.generated} הודעות`,
        ...result,
      });
    }

    return NextResponse.json({ error: "חסר insightId או insightIds" }, { status: 400 });
  } catch (error) {
    console.error("Message generation error:", error);
    return NextResponse.json({ error: "שגיאה ביצירת הודעה" }, { status: 500 });
  }
}
