import { NextResponse } from "next/server";
import { seedOfficeTips } from "@/lib/seed-tips";
import { requireAuth } from "@/lib/auth";

export async function POST() {
  const { response: authResponse } = await requireAuth();
  if (authResponse) return authResponse;
  const count = await seedOfficeTips();

  if (count === 0) {
    return NextResponse.json(
      { message: "Tips already exist, skipping seed", count: 0 },
      { status: 200 }
    );
  }

  return NextResponse.json(
    { message: `Seeded ${count} office tips`, count },
    { status: 201 }
  );
}
