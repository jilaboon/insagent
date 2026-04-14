import { NextResponse } from "next/server";
import { seedOfficeTips } from "@/lib/seed-tips";
import { requireAuth, requireRole } from "@/lib/auth";

export async function POST() {
  const { response: authResponse, role } = await requireAuth();
  if (authResponse) return authResponse;

  const roleResponse = requireRole(role, ["OWNER", "ADMIN"]);
  if (roleResponse) return roleResponse;
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
