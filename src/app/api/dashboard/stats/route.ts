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
    lastInsightRunSetting,
    latestRuleUpdate,
    latestImport,
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
    prisma.systemSetting.findUnique({ where: { key: "lastInsightRunAt" } }),
    prisma.officeRule.findFirst({ where: { isActive: true }, orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
    prisma.importJob.findFirst({ where: { status: "COMPLETED" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
  ]);

  // Determine if re-run is needed
  const lastRunAt = lastInsightRunSetting?.value ? new Date(lastInsightRunSetting.value) : null;
  const needsRerun = !lastRunAt
    || (latestImport?.createdAt && latestImport.createdAt > lastRunAt)
    || (latestRuleUpdate?.updatedAt && latestRuleUpdate.updatedAt > lastRunAt);

  const newRulesSinceLastRun = lastRunAt
    ? await prisma.officeRule.count({ where: { isActive: true, updatedAt: { gt: lastRunAt } } })
    : 0;

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
    needsRerun,
    newRulesSinceLastRun,
    lastInsightRunAt: lastInsightRunSetting?.value ?? null,
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
