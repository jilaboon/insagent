/**
 * Rule engine types for the deterministic insight generation layer.
 */

import type {
  Customer,
  Policy,
  Coverage,
  InvestmentTrack,
  ManagementFee,
  InsightCategory,
} from "@/generated/prisma/client";

// ============================================================
// Customer Profile — enriched customer data for rule evaluation
// ============================================================

export interface CustomerProfile {
  customer: Customer & {
    policies: (Policy & {
      coverages: Coverage[];
      investmentTracks: InvestmentTrack[];
      managementFees: ManagementFee[];
    })[];
  };
  // Computed aggregates
  totalMonthlyPremium: number;
  totalAnnualPremium: number;
  totalAccumulatedSavings: number;
  categoryBreakdown: Map<string, CategoryInfo>;
  activePolicies: (Policy & {
    coverages: Coverage[];
    investmentTracks: InvestmentTrack[];
    managementFees: ManagementFee[];
  })[];
  nearestExpiry: Date | null;
  oldestPolicyStartDate: Date | null;
  hasLifeBranch: boolean;
  hasElementaryBranch: boolean;
  maxManagementFeePercent: number | null;
}

export interface CategoryInfo {
  count: number;
  activeCount: number;
  totalPremium: number;
  policies: Policy[];
}

// ============================================================
// Rule interface
// ============================================================

export interface InsightRule {
  id: string;
  name: string; // Hebrew name
  category: InsightCategory;
  evaluate(profile: CustomerProfile): RuleResult | null;
}

export interface ScoringHints {
  financialImpact: number; // 0-100
  dataConfidence: number; // 0-100
  urgency: number; // 0-100
  actionClarity: number; // 0-100
  customerFit: number; // 0-100
}

export interface RuleResult {
  ruleId: string;
  category: InsightCategory;
  title: string;
  summary: string;
  explanation: string;
  whyNow: string;
  urgencyLevel: 0 | 1 | 2;
  branch: "LIFE" | "ELEMENTARY";
  evidence: Record<string, unknown>;
  scoringHints: ScoringHints;
}
