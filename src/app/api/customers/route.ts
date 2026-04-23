import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const { response: authResponse } = await requireAuth();
  if (authResponse) return authResponse;

  const searchParams = request.nextUrl.searchParams;

  const page = parseInt(searchParams.get("page") || "1", 10);
  const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 200);
  const search = searchParams.get("search") || undefined;
  // source filter: "all" | "office" | "har_habituach_only" | "has_external"
  const sourceFilter = searchParams.get("source") || "all";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};

  if (search) {
    where.OR = [
      { firstName: { contains: search, mode: "insensitive" } },
      { lastName: { contains: search, mode: "insensitive" } },
      { israeliId: { contains: search } },
    ];
  }

  if (sourceFilter === "office") {
    where.AND = [...(where.AND ?? []), { NOT: { source: "HAR_HABITUACH_ONLY" } }];
  } else if (sourceFilter === "har_habituach_only") {
    where.source = "HAR_HABITUACH_ONLY";
  } else if (sourceFilter === "has_external") {
    where.policies = { some: { externalSource: "HAR_HABITUACH" } };
  }

  const [customers, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      include: {
        policies: {
          select: { id: true, status: true, externalSource: true },
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
    phone: c.phone,
    email: c.email,
    address: c.address,
    source: c.source,
    lastHarHabituachImportAt: c.lastHarHabituachImportAt?.toISOString() ?? null,
    lastImportDate: c.lastImportDate?.toISOString() ?? null,
    policyCount: c._count.policies,
    activePolicyCount: c.policies.filter((p) => p.status === "ACTIVE").length,
    externalPolicyCount: c.policies.filter(
      (p) => p.externalSource === "HAR_HABITUACH"
    ).length,
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
