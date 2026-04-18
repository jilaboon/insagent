import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";

const DAY_MS = 24 * 60 * 60 * 1000;

export async function GET() {
  const { response: authResponse } = await requireAuth();
  if (authResponse) return authResponse;

  const now = new Date();
  const windowEnd = new Date(now.getTime() + 90 * DAY_MS);

  const policies = await prisma.policy.findMany({
    where: {
      status: "ACTIVE",
      endDate: { gte: now, lte: windowEnd },
    },
    orderBy: { endDate: "asc" },
    select: {
      id: true,
      category: true,
      endDate: true,
      premiumMonthly: true,
      premiumAnnual: true,
      insurer: true,
      customer: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          israeliId: true,
          phone: true,
          email: true,
        },
      },
    },
    take: 500,
  });

  const items = policies
    .filter(
      (p) =>
        p.customer.firstName &&
        p.customer.firstName.trim() !== "" &&
        p.customer.firstName !== "לא ידוע"
    )
    .map((p) => ({
      policyId: p.id,
      category: p.category,
      endDate: p.endDate,
      daysToExpiry: p.endDate
        ? Math.max(0, Math.ceil((p.endDate.getTime() - now.getTime()) / DAY_MS))
        : null,
      insurer: p.insurer,
      premiumMonthly: p.premiumMonthly ? Number(p.premiumMonthly) : null,
      premiumAnnual: p.premiumAnnual ? Number(p.premiumAnnual) : null,
      customer: {
        id: p.customer.id,
        fullName: `${p.customer.firstName} ${p.customer.lastName}`.trim(),
        israeliId: p.customer.israeliId,
        phone: p.customer.phone,
        email: p.customer.email,
      },
    }));

  return NextResponse.json({ items, total: items.length });
}
