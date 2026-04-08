import type { InsightCategory, InsightStatus } from "@/generated/prisma/client";

export interface InsightListItem {
  id: string;
  customerId: string;
  customerName: string;
  customerIsraeliId: string;
  category: InsightCategory;
  title: string;
  summary: string;
  strengthScore: number;
  urgencyLevel: number;
  branch: "LIFE" | "ELEMENTARY";
  messageStatus: "none" | "draft" | "approved" | "sent";
  status: InsightStatus;
  createdAt: string;
}

export interface InsightDetail extends InsightListItem {
  explanation: string | null;
  whyNow: string | null;
  evidenceJson: Record<string, unknown> | null;
  generatedBy: string;
  dataFreshness: number;
  profileCompleteness: number;
}

export interface InsightFilters {
  search?: string;
  branch?: ("LIFE" | "ELEMENTARY")[];
  categories?: InsightCategory[];
  urgency?: number[];
  scoreMin?: number;
  scoreMax?: number;
  messageStatus?: ("none" | "draft" | "approved" | "sent")[];
  status?: InsightStatus[];
  page: number;
  limit: number;
  sortBy: string;
  sortDir: "asc" | "desc";
}

export interface ScoringHints {
  financialImpact: number;
  dataConfidence: number;
  urgency: number;
  actionClarity: number;
  customerFit: number;
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
