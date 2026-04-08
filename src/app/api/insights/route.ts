import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  const page = parseInt(searchParams.get("page") || "1", 10);
  const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 200);
  const search = searchParams.get("search") || undefined;
  const branch = searchParams.get("branch") || undefined;
  const category = searchParams.get("category") || undefined;
  const urgency = searchParams.get("urgency");
  const scoreMin = parseInt(searchParams.get("scoreMin") || "0", 10);
  const scoreMax = parseInt(searchParams.get("scoreMax") || "100", 10);
  const sortBy = searchParams.get("sortBy") || "strengthScore";
  const sortDir = (searchParams.get("sortDir") || "desc") as "asc" | "desc";

  // Build where clause
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};

  if (branch) {
    where.branch = branch;
  }

  if (category) {
    where.category = category;
  }

  if (urgency != null) {
    where.urgencyLevel = parseInt(urgency, 10);
  }

  if (scoreMin > 0 || scoreMax < 100) {
    where.strengthScore = {
      gte: scoreMin,
      lte: scoreMax,
    };
  }

  if (search) {
    where.OR = [
      { title: { contains: search, mode: "insensitive" } },
      { summary: { contains: search, mode: "insensitive" } },
      {
        customer: {
          OR: [
            { firstName: { contains: search, mode: "insensitive" } },
            { lastName: { contains: search, mode: "insensitive" } },
            { israeliId: { contains: search } },
          ],
        },
      },
    ];
  }

  const [insights, total] = await Promise.all([
    prisma.insight.findMany({
      where,
      include: {
        customer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            israeliId: true,
          },
        },
        messageDrafts: {
          select: { id: true, status: true },
          take: 1,
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: sortBy === "strengthScore"
        ? { strengthScore: sortDir }
        : sortBy === "urgencyLevel"
          ? { urgencyLevel: sortDir }
          : { createdAt: sortDir },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.insight.count({ where }),
  ]);

  const items = insights.map((i) => ({
    id: i.id,
    customerId: i.customerId,
    customerName: `${i.customer.firstName} ${i.customer.lastName}`.trim(),
    customerIsraeliId: i.customer.israeliId,
    category: i.category,
    title: i.title,
    summary: i.summary,
    explanation: i.explanation,
    whyNow: i.whyNow,
    strengthScore: i.strengthScore ?? 0,
    urgencyLevel: i.urgencyLevel,
    branch: i.branch || "LIFE",
    status: i.status,
    generatedBy: i.generatedBy,
    dataFreshness: i.dataFreshness,
    profileCompleteness: i.profileCompleteness,
    evidenceJson: i.evidenceJson,
    messageStatus: i.messageDrafts.length > 0 ? i.messageDrafts[0].status : "none",
    createdAt: i.createdAt.toISOString(),
  }));

  return NextResponse.json({
    items,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
}
