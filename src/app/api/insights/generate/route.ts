import { NextRequest, NextResponse } from "next/server";
import { generateInsightsForAll, generateInsightsForCustomer } from "@/lib/insights/engine";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { customerId, includeAI = false } = body;

    if (customerId) {
      // Generate for a single customer
      const result = await generateInsightsForCustomer(customerId, { includeAI });
      return NextResponse.json({
        message: "תובנות נוצרו בהצלחה",
        ...result,
      });
    }

    // Generate for all customers
    const result = await generateInsightsForAll({
      includeAI,
      onProgress: () => {
        // Progress tracking could use SSE in the future
      },
    });

    return NextResponse.json({
      message: "תובנות נוצרו בהצלחה",
      ...result,
    });
  } catch (error) {
    console.error("Insight generation error:", error);
    return NextResponse.json(
      { error: "שגיאה ביצירת תובנות" },
      { status: 500 }
    );
  }
}
