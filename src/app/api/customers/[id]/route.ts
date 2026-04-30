import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

// ============================================================
// Status buckets — kept in sync with src/lib/insights/rule-matcher.ts.
// CANCELLED / EXPIRED policies must never appear in aggregates.
// FROZEN / PAID_UP / ARREARS are inactive for premium / count
// purposes; PAID_UP still holds savings so it counts there.
// ============================================================
const ACTIVE_FOR_PREMIUM = new Set([
  "ACTIVE",
  "PROPOSAL",
  "UNKNOWN",
]);
const ACTIVE_FOR_SAVINGS = new Set([
  "ACTIVE",
  "PROPOSAL",
  "UNKNOWN",
  "PAID_UP",
]);

function isActiveForPremium(p: { status: string }): boolean {
  return ACTIVE_FOR_PREMIUM.has(p.status);
}

function isActiveForSavings(p: { status: string }): boolean {
  return ACTIVE_FOR_SAVINGS.has(p.status);
}

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

// ============================================================
// Customer 360 — Phase 2 helpers
// ============================================================

/**
 * Convert a Prisma Decimal (or null/undefined) to a plain number.
 * The Decimal type loses no precision crossing JSON, but the API
 * contract is `number | null`, so we collapse here once.
 */
function decimalToNumber(
  value: Prisma.Decimal | null | undefined
): number | null {
  if (value === null || value === undefined) return null;
  return value.toNumber();
}

/** Round to nearest 1000; return null when input is null/undefined. */
function roundTo1000(n: number | null | undefined): number | null {
  if (n === null || n === undefined) return null;
  if (!Number.isFinite(n)) return null;
  return Math.round(n / 1000) * 1000;
}

const PENSION_PRODUCT_CODES = new Set(["3", "5"]);
const PROVIDENT_PRODUCT_CODES = new Set(["2", "4"]);

const ALL_POLICY_CATEGORIES = [
  "PROPERTY",
  "HEALTH",
  "LIFE",
  "PENSION",
  "SAVINGS",
  "RISK",
  "PROVIDENT",
] as const;

/**
 * Audit a Customer 360 view. De-duplicated to once per
 * (operator, customer, calendar day) because the audit table has no
 * unique constraint enforcing that — best-effort dedupe via a
 * range query before insert. Failures are swallowed by `logAudit`.
 *
 * Privacy: actor is identified by their internal user id (resolved
 * inside `logAudit` from email); details carry no national IDs or
 * contact info — only the customer id, which is already the entityId.
 */
async function maybeLogCustomer360Session(
  operatorEmail: string,
  customerId: string
): Promise<void> {
  if (!operatorEmail) return;
  try {
    const actor = await prisma.user.findUnique({
      where: { email: operatorEmail },
      select: { id: true },
    });
    if (!actor) {
      // No internal user record — let logAudit handle the lookup
      // path (which will also miss); skip dedupe and just log.
      await logAudit({
        actorEmail: operatorEmail,
        action: "customer_360_session",
        entityType: "customer",
        entityId: customerId,
      });
      return;
    }
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);

    const existing = await prisma.auditEntry.findFirst({
      where: {
        actorId: actor.id,
        entityType: "customer",
        entityId: customerId,
        action: "customer_360_session",
        createdAt: { gte: startOfDay, lt: endOfDay },
      },
      select: { id: true },
    });
    if (existing) return;

    await logAudit({
      actorEmail: operatorEmail,
      action: "customer_360_session",
      entityType: "customer",
      entityId: customerId,
    });
  } catch (err) {
    // Audit must never break a request.
    console.error("customer_360_session dedupe failed", err);
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const {
    response: authResponse,
    email: operatorEmail,
  } = await requireAuth();
  if (authResponse) return authResponse;

  const { id } = await params;

  // ----------------------------------------------------------------
  // Round trip 1 — base customer aggregate (unchanged).
  // ----------------------------------------------------------------
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      familyMembers: true,
      policies: {
        include: {
          coverages: true,
          investmentTracks: true,
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

  // ----------------------------------------------------------------
  // Round trips 2–4 — institutional products + import jobs in parallel.
  // The third batched query (productCount/policyCount per import) is
  // grouped on the client side, not per-job, to avoid N+1.
  // ----------------------------------------------------------------
  const [financialProductRows, importJobRows] = await Promise.all([
    prisma.customerFinancialProduct.findMany({
      where: { customerId: id },
      include: {
        provider: true,
        balances: {
          orderBy: { snapshotDate: "desc" },
        },
      },
    }),
    prisma.importJob.findMany({
      where: {
        customerLinks: { some: { customerId: id } },
        deletedAt: null,
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        kind: true,
        fileType: true,
        fileName: true,
        status: true,
        createdAt: true,
        completedAt: true,
        metadataJson: true,
      },
    }),
  ]);

  const importJobIds = importJobRows.map((j) => j.id);

  // Batched per-import counts. Two grouped queries instead of 2*N
  // per-import counts — same result, single round-trip each.
  const [financialProductCounts, policyCounts] = await Promise.all([
    importJobIds.length > 0
      ? prisma.customerFinancialProduct.groupBy({
          by: ["importJobId"],
          where: {
            customerId: id,
            importJobId: { in: importJobIds },
          },
          _count: { _all: true },
        })
      : Promise.resolve(
          [] as Array<{
            importJobId: string | null;
            _count: { _all: number };
          }>
        ),
    importJobIds.length > 0
      ? prisma.policy.groupBy({
          by: ["importJobId"],
          where: {
            customerId: id,
            importJobId: { in: importJobIds },
          },
          _count: { _all: true },
        })
      : Promise.resolve(
          [] as Array<{
            importJobId: string | null;
            _count: { _all: number };
          }>
        ),
  ]);

  const productCountByJob = new Map<string, number>();
  for (const row of financialProductCounts) {
    if (row.importJobId) {
      productCountByJob.set(row.importJobId, row._count._all);
    }
  }
  const policyCountByJob = new Map<string, number>();
  for (const row of policyCounts) {
    if (row.importJobId) {
      policyCountByJob.set(row.importJobId, row._count._all);
    }
  }

  // Fire-and-forget audit; explicitly not awaited inside the response
  // chain to keep latency tight, but we do `void` it so unhandled-
  // rejection guards still see it. `logAudit` itself swallows errors.
  void maybeLogCustomer360Session(operatorEmail, id);

  // ----------------------------------------------------------------
  // Build insurance map from policies (existing behavior).
  // ----------------------------------------------------------------
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

  for (const cat of ALL_POLICY_CATEGORIES) {
    // The aggregates that drive the dashboard cards must exclude
    // CANCELLED / EXPIRED policies (and FROZEN/PAID_UP/ARREARS for
    // premium-based metrics). Savings-based aggregates keep PAID_UP
    // — that money is still in the account.
    const allCatPolicies = customer.policies.filter((p) => p.category === cat);
    const premiumCatPolicies = allCatPolicies.filter(isActiveForPremium);
    const savingsCatPolicies = allCatPolicies.filter(isActiveForSavings);

    // The card "exists" iff there is at least one policy in any state
    // for this category — even an inactive one is worth surfacing in
    // the UI list. Aggregates are zeroed when all premium-active
    // counterparts are gone.
    if (allCatPolicies.length === 0) {
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

    const insurers = [...new Set(premiumCatPolicies.map((p) => p.insurer))];
    const totalAnnualPremium = premiumCatPolicies.reduce(
      (sum, p) => sum + (p.premiumAnnual ?? 0),
      0
    );
    const totalMonthlyPremium = premiumCatPolicies.reduce(
      (sum, p) => sum + (p.premiumMonthly ?? 0),
      0
    );
    const totalAccumulated = savingsCatPolicies.reduce(
      (sum, p) => sum + (p.accumulatedSavings ?? 0),
      0
    );

    // Nearest expiry among ACTIVE policies with an end date.
    // Inactive (CANCELLED / EXPIRED) policies have no meaningful
    // future expiry — don't report them as upcoming.
    const expiryDates = premiumCatPolicies
      .filter((p) => p.endDate && p.status === "ACTIVE")
      .map((p) => p.endDate!)
      .sort((a, b) => a.getTime() - b.getTime());

    // Latest data freshness — keep all policies. Even an inactive
    // policy's freshness signals when we last saw the customer.
    const freshnessDates = allCatPolicies
      .filter((p) => p.dataFreshnessDate)
      .map((p) => p.dataFreshnessDate!)
      .sort((a, b) => b.getTime() - a.getTime());

    insuranceMap[cat] = {
      exists: premiumCatPolicies.length > 0,
      policyCount: premiumCatPolicies.length,
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

  // Tenure with the office — derived from the oldest startDate across
  // all OFFICE policies (Har HaBituach excluded, every status counted).
  // The anchor policy id lets the UI highlight the row that defines
  // the tenure number.
  const officePoliciesWithStart = customer.policies.filter(
    (p) => p.externalSource !== "HAR_HABITUACH" && p.startDate
  );
  let tenureYears: number | null = null;
  let anchorPolicyId: string | null = null;
  let oldestStartDate: string | null = null;
  if (officePoliciesWithStart.length > 0) {
    const sorted = [...officePoliciesWithStart].sort(
      (a, b) =>
        (a.startDate?.getTime() ?? 0) - (b.startDate?.getTime() ?? 0)
    );
    const oldest = sorted[0];
    tenureYears =
      (Date.now() - oldest.startDate!.getTime()) /
      (365.25 * 24 * 60 * 60 * 1000);
    anchorPolicyId = oldest.id;
    oldestStartDate = oldest.startDate!.toISOString();
  }

  // ----------------------------------------------------------------
  // Build financialProducts array.
  //
  // Latest balance: most recent snapshotDate (already sorted desc
  // by the include's orderBy). Total balance: sum across all tracks
  // sharing the latest snapshotDate when at least one is a
  // TRACK_BALANCE row — otherwise fall back to the PRODUCT_TOTAL
  // value on that latest date.
  // ----------------------------------------------------------------
  const financialProducts = financialProductRows.map((p) => {
    const allBalances = p.balances; // already desc by snapshotDate

    let latestBalance:
      | {
          snapshotDate: string;
          snapshotKind: string;
          balanceAmount: number | null;
          redemptionAmount: number | null;
          monthlyContribution: number | null;
          employeeContribution: number | null;
          employerContribution: number | null;
          compensationComponent: number | null;
          ytdReturn: number | null;
        }
      | null = null;
    let totalBalanceAmount: number | null = null;

    if (allBalances.length > 0) {
      const newestDate = allBalances[0].snapshotDate.getTime();
      const sameDateRows = allBalances.filter(
        (b) => b.snapshotDate.getTime() === newestDate
      );

      // Prefer TRACK_BALANCE for the "latest" reference snapshot, since
      // that's the per-track granularity. Fall back to PRODUCT_TOTAL
      // when no track rows exist on that date, or any row otherwise.
      const trackRows = sameDateRows.filter(
        (b) => b.snapshotKind === "TRACK_BALANCE"
      );
      const productTotalRows = sameDateRows.filter(
        (b) => b.snapshotKind === "PRODUCT_TOTAL"
      );

      const reference =
        trackRows[0] ?? productTotalRows[0] ?? sameDateRows[0];

      latestBalance = {
        snapshotDate: reference.snapshotDate.toISOString(),
        snapshotKind: reference.snapshotKind,
        balanceAmount: decimalToNumber(reference.balanceAmount),
        redemptionAmount: decimalToNumber(reference.redemptionAmount),
        monthlyContribution: decimalToNumber(reference.monthlyContribution),
        employeeContribution: decimalToNumber(reference.employeeContribution),
        employerContribution: decimalToNumber(reference.employerContribution),
        compensationComponent: decimalToNumber(
          reference.compensationComponent
        ),
        ytdReturn: decimalToNumber(reference.ytdReturn),
      };

      // Total = sum of TRACK_BALANCE rows on the latest date.
      // If no TRACK_BALANCE rows exist, fall back to PRODUCT_TOTAL on
      // the same date. If neither, null.
      if (trackRows.length > 0) {
        totalBalanceAmount = trackRows.reduce((sum, row) => {
          const v = decimalToNumber(row.balanceAmount);
          return v === null ? sum : sum + v;
        }, 0);
      } else if (productTotalRows.length > 0) {
        const v = decimalToNumber(productTotalRows[0].balanceAmount);
        totalBalanceAmount = v;
      } else {
        totalBalanceAmount = null;
      }
    }

    return {
      id: p.id,
      providerId: p.providerId,
      providerName: p.provider?.providerName ?? null,
      providerShortName: p.provider?.shortName ?? null,
      providerCategory: p.provider?.category ?? null,
      source: p.source,
      sourceFileName: p.sourceFileName,
      productTypeCode: p.productTypeCode,
      productTypeLabel: p.productTypeLabel,
      interfaceType: p.interfaceType,
      planName: p.planName,
      policyOrAccountNumber: p.policyOrAccountNumber,
      unifiedProductCode: p.unifiedProductCode,
      statusCode: p.statusCode,
      statusLabel: p.statusLabel,
      isActive: p.isActive,
      joinDate: p.joinDate?.toISOString() ?? null,
      firstJoinDate: p.firstJoinDate?.toISOString() ?? null,
      lastUpdatedDate: p.lastUpdatedDate?.toISOString() ?? null,
      valuationDate: p.valuationDate?.toISOString() ?? null,
      hasLoan: p.hasLoan,
      hasArrears: p.hasArrears,
      hasExternalCoverage: p.hasExternalCoverage,
      hasBeneficiaries: p.hasBeneficiaries,
      hasAttorney: p.hasAttorney,
      employerName: p.employerName,
      employerCode: p.employerCode,
      latestBalance,
      totalBalanceAmount,
      importJobId: p.importJobId,
    };
  });

  // Sort: active first; then by valuationDate DESC (null last);
  // then by joinDate DESC (null last).
  financialProducts.sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    const aVal = a.valuationDate ? Date.parse(a.valuationDate) : -Infinity;
    const bVal = b.valuationDate ? Date.parse(b.valuationDate) : -Infinity;
    if (aVal !== bVal) return bVal - aVal;
    const aJoin = a.joinDate ? Date.parse(a.joinDate) : -Infinity;
    const bJoin = b.joinDate ? Date.parse(b.joinDate) : -Infinity;
    return bJoin - aJoin;
  });

  // ----------------------------------------------------------------
  // Build imports array.
  //
  // Provider names are extracted from `metadataJson.files[].providerName`
  // (Misleka batch shape). Other import kinds may or may not populate
  // the same shape; we degrade gracefully — if no `files` array, we
  // surface an empty providers list rather than guessing.
  // ----------------------------------------------------------------
  const imports = importJobRows.map((j) => {
    const providers: string[] = [];
    const md = j.metadataJson;
    if (md && typeof md === "object" && !Array.isArray(md)) {
      const files = (md as { files?: unknown }).files;
      if (Array.isArray(files)) {
        const seen = new Set<string>();
        for (const file of files) {
          if (!file || typeof file !== "object") continue;
          const name = (file as { providerName?: unknown }).providerName;
          if (typeof name === "string" && name.length > 0 && !seen.has(name)) {
            seen.add(name);
            providers.push(name);
          }
        }
      }
    }
    return {
      id: j.id,
      kind: j.kind ?? null,
      fileType: j.fileType,
      fileName: j.fileName,
      status: j.status,
      createdAt: j.createdAt.toISOString(),
      completedAt: j.completedAt?.toISOString() ?? null,
      providers,
      productCount: productCountByJob.get(j.id) ?? 0,
      policyCount: policyCountByJob.get(j.id) ?? 0,
    };
  });

  // ----------------------------------------------------------------
  // Build contextSummary — lightweight subset of the eventual
  // CustomerContext (Phase 3). All wealth aggregates rounded to
  // nearest 1000 in the response.
  // ----------------------------------------------------------------

  // Coverage breadth.
  const hasInstitutionalProducts = financialProductRows.length > 0;
  const harHabituachPolicies = customer.policies.filter(
    (p) => p.externalSource === "HAR_HABITUACH"
  );
  const hasExternalProducts =
    harHabituachPolicies.length > 0 || hasInstitutionalProducts;

  // Provider count: union of distinct insurer names across
  // (a) active BAFI/HaR policies, (b) Misleka providers.
  const providerSet = new Set<string>();
  for (const p of customer.policies) {
    if (p.insurer && p.insurer.trim().length > 0) {
      providerSet.add(`POLICY::${p.insurer.trim()}`);
    }
  }
  for (const fp of financialProductRows) {
    if (fp.providerId) {
      providerSet.add(`PROVIDER::${fp.providerId}`);
    } else if (fp.provider?.providerName) {
      providerSet.add(`PROVIDER::${fp.provider.providerName}`);
    }
  }
  const providersCount = providerSet.size;

  // Completeness score: 0 = BAFI only, 1 = +HaR, 2 = +Misleka,
  // 3 = +banking. Banking always 0 in Phase 1/2.
  let completenessScore = 0;
  if (harHabituachPolicies.length > 0) completenessScore = 1;
  if (hasInstitutionalProducts) {
    completenessScore = Math.max(completenessScore, 2);
  }
  // Phase 4 will bump to 3 once banking lands.

  // Wealth aggregates from BAFI + Misleka. Use the per-product
  // total computed above so multi-track products contribute their
  // full sum, not just one track.
  const bafiAccumulatedSavings = customer.policies
    .filter(isActiveForSavings)
    .reduce((sum, p) => sum + (p.accumulatedSavings ?? 0), 0);

  const mislekaTotalsByCode: Map<string, number> = new Map();
  let mislekaTotalAllProducts = 0;
  let monthlyContributionEstimate = 0;
  let hasAnyMonthlyContribution = false;
  let missingBalanceCount = 0;

  for (const product of financialProducts) {
    if (product.totalBalanceAmount === null) {
      missingBalanceCount += 1;
    } else {
      mislekaTotalAllProducts += product.totalBalanceAmount;
      const prev = mislekaTotalsByCode.get(product.productTypeCode) ?? 0;
      mislekaTotalsByCode.set(
        product.productTypeCode,
        prev + product.totalBalanceAmount
      );
    }
    const mc = product.latestBalance?.monthlyContribution ?? null;
    if (mc !== null) {
      monthlyContributionEstimate += mc;
      hasAnyMonthlyContribution = true;
    }
  }

  const pensionRaw = [...PENSION_PRODUCT_CODES].reduce(
    (sum, code) => sum + (mislekaTotalsByCode.get(code) ?? 0),
    0
  );
  const providentRaw = [...PROVIDENT_PRODUCT_CODES].reduce(
    (sum, code) => sum + (mislekaTotalsByCode.get(code) ?? 0),
    0
  );
  const hasAnyPension = [...PENSION_PRODUCT_CODES].some((code) =>
    mislekaTotalsByCode.has(code)
  );
  const hasAnyProvident = [...PROVIDENT_PRODUCT_CODES].some((code) =>
    mislekaTotalsByCode.has(code)
  );

  // Insurance gaps — categories with no active premium-bearing
  // BAFI policies. Excludes pure-savings categories implicitly via
  // ALL_POLICY_CATEGORIES (PENSION/SAVINGS/PROVIDENT show as gaps too,
  // which is the desired Phase 2 signal — HaR or Misleka coverage
  // there is reflected via hasExternalProducts/contextSummary, not
  // by hiding the gap).
  const activeCategoriesSet = new Set<string>();
  for (const p of customer.policies) {
    if (isActiveForPremium(p) && p.externalSource !== "HAR_HABITUACH") {
      activeCategoriesSet.add(p.category);
    }
  }
  const insuranceGaps = ALL_POLICY_CATEGORIES.filter(
    (c) => !activeCategoriesSet.has(c)
  );

  // What's changed (last 30 days).
  const now = Date.now();
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
  const thirtyDaysAgo = now - THIRTY_DAYS_MS;

  const newProductsLast30Days = financialProductRows.filter(
    (p) => p.createdAt.getTime() >= thirtyDaysAgo
  ).length;

  const policiesExpiringWithin90Days = customer.policies.filter((p) => {
    if (!p.endDate) return false;
    const t = p.endDate.getTime();
    return t > now && t <= now + NINETY_DAYS_MS;
  }).length;

  // Opportunity signals.
  const newInsights = customer.insights.filter((i) => i.status === "NEW");
  const strongInsightsCount = newInsights.filter(
    (i) => (i.strengthScore ?? 0) >= 80
  ).length;
  const topInsightStrengthScore = newInsights.length
    ? Math.max(...newInsights.map((i) => i.strengthScore ?? 0))
    : null;

  // Age signals — based on joinDate of CustomerFinancialProduct rows.
  const joinDates = financialProductRows
    .map((p) => p.joinDate)
    .filter((d): d is Date => d !== null);
  const yearsBetween = (then: Date) =>
    (now - then.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  const oldestProductYears = joinDates.length
    ? Math.max(...joinDates.map(yearsBetween))
    : null;
  const productsOver5Years = joinDates.filter((d) => yearsBetween(d) > 5)
    .length;
  const productsOver10Years = joinDates.filter((d) => yearsBetween(d) > 10)
    .length;

  const totalAccumulatedRaw =
    bafiAccumulatedSavings + mislekaTotalAllProducts;

  const contextSummary = {
    completenessScore,
    providersCount,
    hasExternalProducts,
    hasInstitutionalProducts,
    totalAccumulatedSavingsAllSources:
      roundTo1000(totalAccumulatedRaw) ?? 0,
    pensionBalanceTotal: hasAnyPension ? roundTo1000(pensionRaw) : null,
    providentBalanceTotal: hasAnyProvident ? roundTo1000(providentRaw) : null,
    monthlyContributionEstimate: hasAnyMonthlyContribution
      ? roundTo1000(monthlyContributionEstimate)
      : null,
    insuranceGaps,
    missingBalanceCount,
    newProductsLast30Days,
    policiesExpiringWithin90Days,
    topInsightStrengthScore,
    strongInsightsCount,
    oldestProductYears:
      oldestProductYears === null
        ? null
        : Math.round(oldestProductYears * 10) / 10,
    productsOver5Years,
    productsOver10Years,
  };

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
    tenure: {
      years: tenureYears,
      anchorPolicyId,
      oldestStartDate,
    },
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
      feeOnAccumulationPct: p.feeOnAccumulationPct,
      feeOnPremiumPct: p.feeOnPremiumPct,
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
    // ============================================================
    // Phase 2 additions — Customer 360 server foundation.
    // ============================================================
    financialProducts,
    imports,
    contextSummary,
  });
}
