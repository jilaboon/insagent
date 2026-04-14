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
    recentImports,
    topInsights,
  ] = await Promise.all([
    prisma.customer.count(),
    prisma.insight.count(),
    prisma.insight.count({ where: { urgencyLevel: 2 } }),
    prisma.messageDraft.count({ where: { status: "DRAFT" } }),
    prisma.policy.count({ where: { status: "ACTIVE" } }),
    prisma.importJob.findMany({ orderBy: { createdAt: "desc" }, take: 5, where: { status: "COMPLETED" } }),
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
    lastImportDate: recentImports[0]?.createdAt.toISOString() ?? null,
    lastImport: recentImports[0]
      ? {
          id: recentImports[0].id,
          fileName: recentImports[0].fileName,
          status: recentImports[0].status,
          createdAt: recentImports[0].createdAt.toISOString(),
        }
      : null,
    recentImports: recentImports.map((j) => ({
      id: j.id,
      fileName: j.fileName,
      status: j.status,
      createdAt: j.createdAt.toISOString(),
      newCustomers: j.newCustomers,
      updatedCustomers: j.updatedCustomers,
    })),
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
