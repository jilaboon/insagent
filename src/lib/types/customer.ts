import type {
  PolicyCategory,
  PolicyStatus,
} from "@prisma/client";

export interface CustomerProfilePolicy {
  id: string;
  policyNumber: string;
  insurer: string;
  category: PolicyCategory;
  subType: string | null;
  status: PolicyStatus;
  productName: string | null;
  startDate: string | null;
  endDate: string | null;
  premiumMonthly: number | null;
  premiumAnnual: number | null;
  accumulatedSavings: number | null;
  accountType: string | null;
  vehicleYear: number | null;
  vehiclePlate: string | null;
  vehicleModel: string | null;
  propertyAddress: string | null;
  dataFreshnessDate: string | null;
  investmentTracks: {
    id: string;
    name: string;
    accumulatedAmount: number | null;
    ytdReturn: number | null;
  }[];
  managementFees: {
    id: string;
    feeType: string;
    ratePercent: number | null;
  }[];
}

export interface CustomerProfileAggregates {
  totalMonthlyPremium: number;
  totalAnnualPremium: number;
  totalAccumulatedSavings: number;
  categoryBreakdown: Record<
    string,
    { count: number; premium: number; activeCount: number }
  >;
  nearestExpiry: string | null;
  policyCount: number;
  activePolicyCount: number;
  hasLifeBranch: boolean;
  hasElementaryBranch: boolean;
  sourceFiles: string[];
}
