import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { response: authResponse } = await requireAuth();
  if (authResponse) return authResponse;

  const { id } = await params;

  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      familyMembers: true,
      policies: {
        include: {
          coverages: true,
          investmentTracks: true,
          managementFees: true,
        },
        orderBy: { category: "asc" },
      },
      insights: {
        include: {
          messageDrafts: {
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
        orderBy: { strengthScore: "desc" },
      },
      messageDrafts: {
        orderBy: { createdAt: "desc" },
      },
      importLinks: {
        include: {
          importJob: {
            select: {
              id: true,
              fileName: true,
              createdAt: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!customer) {
    return NextResponse.json({ error: "לקוח לא נמצא" }, { status: 404 });
  }

  // Build insurance map from policies
  const categories = [
    "PROPERTY",
    "HEALTH",
    "LIFE",
    "PENSION",
    "SAVINGS",
    "RISK",
    "PROVIDENT",
  ] as const;

  const insuranceMap: Record<
    string,
    {
      exists: boolean;
      policyCount: number;
      totalAnnualPremium: number;
      totalMonthlyPremium: number;
      totalAccumulated: number;
      insurers: string[];
      nearestExpiry: string | null;
      dataFreshness: string | null;
    }
  > = {};

  for (const cat of categories) {
    const catPolicies = customer.policies.filter((p) => p.category === cat);
    if (catPolicies.length === 0) {
      insuranceMap[cat] = {
        exists: false,
        policyCount: 0,
        totalAnnualPremium: 0,
        totalMonthlyPremium: 0,
        totalAccumulated: 0,
        insurers: [],
        nearestExpiry: null,
        dataFreshness: null,
      };
      continue;
    }

    const insurers = [...new Set(catPolicies.map((p) => p.insurer))];
    const totalAnnualPremium = catPolicies.reduce(
      (sum, p) => sum + (p.premiumAnnual ?? 0),
      0
    );
    const totalMonthlyPremium = catPolicies.reduce(
      (sum, p) => sum + (p.premiumMonthly ?? 0),
      0
    );
    const totalAccumulated = catPolicies.reduce(
      (sum, p) => sum + (p.accumulatedSavings ?? 0),
      0
    );

    // Nearest expiry among active policies with an end date
    const expiryDates = catPolicies
      .filter((p) => p.endDate && p.status === "ACTIVE")
      .map((p) => p.endDate!)
      .sort((a, b) => a.getTime() - b.getTime());

    // Latest data freshness date
    const freshnessDates = catPolicies
      .filter((p) => p.dataFreshnessDate)
      .map((p) => p.dataFreshnessDate!)
      .sort((a, b) => b.getTime() - a.getTime());

    insuranceMap[cat] = {
      exists: true,
      policyCount: catPolicies.length,
      totalAnnualPremium,
      totalMonthlyPremium,
      totalAccumulated,
      insurers,
      nearestExpiry: expiryDates[0]?.toISOString() ?? null,
      dataFreshness: freshnessDates[0]?.toISOString() ?? null,
    };
  }

  const importFileCount = customer.importLinks.length;
  const lastImportDate =
    customer.importLinks[0]?.importJob.createdAt.toISOString() ?? null;

  return NextResponse.json({
    id: customer.id,
    firstName: customer.firstName,
    lastName: customer.lastName,
    israeliId: customer.israeliId,
    address: customer.address,
    phone: customer.phone,
    email: customer.email,
    age: customer.age,
    dateOfBirth: customer.dateOfBirth?.toISOString() ?? null,
    assignedManagerId: customer.assignedManagerId,
    lastImportDate,
    importFileCount,
    familyMembers: customer.familyMembers.map((fm) => ({
      id: fm.id,
      name: fm.name,
      israeliId: fm.israeliId,
      relationship: fm.relationship,
      source: fm.source,
    })),
    insuranceMap,
    policies: customer.policies.map((p) => ({
      id: p.id,
      policyNumber: p.policyNumber,
      insurer: p.insurer,
      category: p.category,
      subType: p.subType,
      status: p.status,
      productName: p.productName,
      startDate: p.startDate?.toISOString() ?? null,
      endDate: p.endDate?.toISOString() ?? null,
      premiumMonthly: p.premiumMonthly,
      premiumAnnual: p.premiumAnnual,
      accumulatedSavings: p.accumulatedSavings,
      vehicleYear: p.vehicleYear,
      vehiclePlate: p.vehiclePlate,
      vehicleModel: p.vehicleModel,
      dataFreshness: p.dataFreshnessDate?.toISOString() ?? null,
      investmentTracks: p.investmentTracks.map((t) => ({
        name: t.name,
        amount: t.accumulatedAmount,
        ytdReturn: t.ytdReturn,
      })),
      managementFees: p.managementFees.map((f) => ({
        type: f.feeType,
        rate: f.ratePercent,
        amount: f.amount,
      })),
    })),
    insights: customer.insights.map((i) => ({
      id: i.id,
      category: i.category,
      title: i.title,
      summary: i.summary,
      explanation: i.explanation,
      whyNow: i.whyNow,
      urgencyLevel: i.urgencyLevel,
      strengthScore: i.strengthScore ?? 0,
      generatedBy: i.generatedBy,
      status: i.status,
      createdAt: i.createdAt.toISOString(),
      messageDraft: i.messageDrafts[0]
        ? {
            id: i.messageDrafts[0].id,
            body: i.messageDrafts[0].body,
            status: i.messageDrafts[0].status,
          }
        : null,
    })),
    messageDrafts: customer.messageDrafts.map((m) => ({
      id: m.id,
      insightId: m.insightId,
      body: m.body,
      tone: m.tone,
      purpose: m.purpose,
      status: m.status,
      generatedBy: m.generatedBy,
      createdAt: m.createdAt.toISOString(),
      updatedAt: m.updatedAt.toISOString(),
    })),
  });
}
