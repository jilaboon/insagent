import { NextRequest, NextResponse } from "next/server";
import { generateMessage, generateMessagesForInsights } from "@/lib/messages/generator";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { insightId, insightIds, agentName } = body;

    if (insightId) {
      const result = await generateMessage(insightId, agentName);
      if (!result) {
        return NextResponse.json({ error: "לא ניתן ליצור הודעה" }, { status: 400 });
      }
      return NextResponse.json(result);
    }

    if (insightIds && Array.isArray(insightIds)) {
      const result = await generateMessagesForInsights(insightIds, agentName);
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
