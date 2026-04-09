import { NextResponse } from "next/server";
import { seedOfficeTips } from "@/lib/seed-tips";

export async function POST() {
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
