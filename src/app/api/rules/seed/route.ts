import { NextResponse } from "next/server";
import { seedOfficeRules } from "@/lib/seed-rules";
import { requireAuth } from "@/lib/auth";

export async function POST() {
  const { response: authResponse } = await requireAuth();
  if (authResponse) return authResponse;

  try {
    const result = await seedOfficeRules();

    if (result.rafiCount === 0 && result.systemCount === 0) {
      return NextResponse.json({
        message: "כללים כבר קיימים — לא נוספו כללים חדשים",
        ...result,
      });
    }

    return NextResponse.json({
      message: `נוצרו ${result.rafiCount} כללי משרד + ${result.systemCount} כללי מערכת`,
      ...result,
    }, { status: 201 });
  } catch (error) {
    console.error("Seed rules error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "שגיאה ביצירת כללים" },
      { status: 500 }
    );
  }
}
