import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function GET() {
  const { response: authResponse } = await requireAuth();
  if (authResponse) return authResponse;
  const [
    totalCustomers,
    totalInsights,
    highUrgencyCount,
    pendingMessages,
    totalPolicies,
    lastImport,
    topInsights,
  ] = await Promise.all([
    prisma.customer.count(),
    prisma.insight.count(),
    prisma.insight.count({ where: { urgencyLevel: 2 } }),
    prisma.messageDraft.count({ where: { status: "DRAFT" } }),
    prisma.policy.count({ where: { status: "ACTIVE" } }),
    prisma.importJob.findFirst({ orderBy: { createdAt: "desc" } }),
    prisma.insight.findMany({
      where: { strengthScore: { not: null } },
      orderBy: { strengthScore: "desc" },
      take: 5,
      include: {
        customer: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    }),
  ]);

  return NextResponse.json({
    totalCustomers,
    totalPolicies,
    totalInsights,
    highUrgencyCount,
    pendingMessages,
    lastImportDate: lastImport?.createdAt.toISOString() ?? null,
    lastImport: lastImport
      ? {
          id: lastImport.id,
          fileName: lastImport.fileName,
          status: lastImport.status,
          createdAt: lastImport.createdAt.toISOString(),
        }
      : null,
    topInsights: topInsights.map((i) => ({
      id: i.id,
      customerId: i.customerId,
      customerName: `${i.customer.firstName} ${i.customer.lastName}`.trim(),
      title: i.title,
      strengthScore: i.strengthScore ?? 0,
      urgencyLevel: i.urgencyLevel,
      category: i.category,
    })),
  });
}
