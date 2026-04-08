import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  const page = parseInt(searchParams.get("page") || "1", 10);
  const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 200);
  const search = searchParams.get("search") || undefined;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};

  if (search) {
    where.OR = [
      { firstName: { contains: search, mode: "insensitive" } },
      { lastName: { contains: search, mode: "insensitive" } },
      { israeliId: { contains: search } },
    ];
  }

  const [customers, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      include: {
        policies: {
          select: { id: true, status: true },
        },
        insights: {
          select: { id: true, strengthScore: true },
          orderBy: { strengthScore: "desc" },
          take: 1,
        },
        _count: {
          select: { policies: true, insights: true },
        },
      },
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.customer.count({ where }),
  ]);

  const items = customers.map((c) => ({
    id: c.id,
    firstName: c.firstName,
    lastName: c.lastName,
    israeliId: c.israeliId,
    address: c.address,
    phone: c.phone,
    email: c.email,
    lastImportDate: c.lastImportDate?.toISOString() ?? null,
    policyCount: c._count.policies,
    activePolicyCount: c.policies.filter((p) => p.status === "ACTIVE").length,
    insightCount: c._count.insights,
    latestInsightScore: c.insights[0]?.strengthScore ?? null,
  }));

  return NextResponse.json({
    items,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
}
