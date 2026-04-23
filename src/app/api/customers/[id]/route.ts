import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

type ScoreBoost = { label: string; delta: number };

type ScoreBreakdown = {
  base: number;
  contextBoosts: ScoreBoost[];
  urgencyBoosts: ScoreBoost[];
  finalScore: number;
};

/**
 * Extract the stored score breakdown from an insight's evidenceJson.
 *
 * `evidenceJson` is a JSONB column, so Prisma returns it already parsed
 * (object / array / null). Older insights — generated before the
 * breakdown feature — won't have `scoreBreakdown` on the object, so we
 * return `null` and let the UI fall back to the plain score badge.
 */
function extractScoreBreakdown(
  evidenceJson: unknown
): ScoreBreakdown | null {
  if (!evidenceJson || typeof evidenceJson !== "object") return null;
  const record = evidenceJson as Record<string, unknown>;
  const raw = record.scoreBreakdown;
  if (!raw || typeof raw !== "object") return null;

  const obj = raw as Record<string, unknown>;
  const base = typeof obj.base === "number" ? obj.base : null;
  const finalScore =
    typeof obj.finalScore === "number" ? obj.finalScore : null;
  if (base === null || finalScore === null) return null;

  const normBoosts = (value: unknown): ScoreBoost[] => {
    if (!Array.isArray(value)) return [];
    return value
      .filter(
        (b): b is ScoreBoost =>
          !!b &&
          typeof b === "object" &&
          typeof (b as ScoreBoost).label === "string" &&
          typeof (b as ScoreBoost).delta === "number"
      )
      .map((b) => ({ label: b.label, delta: b.delta }));
  };

  return {
    base,
    contextBoosts: normBoosts(obj.contextBoosts),
    urgencyBoosts: normBoosts(obj.urgencyBoosts),
    finalScore,
  };
}

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
    email: customer.email, // agents need email for contact
    age: customer.age,
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
      externalSource: p.externalSource,
      harHabituachFirstSeenAt:
        p.harHabituachFirstSeenAt?.toISOString() ?? null,
      harHabituachLastSeenAt:
        p.harHabituachLastSeenAt?.toISOString() ?? null,
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
      // Stage A: segment commercial opportunities from service tips.
      // Older rows pre-dating the migration default to "commercial".
      kind: i.kind ?? "commercial",
      status: i.status,
      createdAt: i.createdAt.toISOString(),
      // Score breakdown — extracted defensively from evidenceJson.
      // Older insights (generated before the breakdown feature) won't
      // have this field, so we return null and the UI degrades to the
      // plain ScoreBadge.
      scoreBreakdown: extractScoreBreakdown(i.evidenceJson),
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
