/**
 * Insight Scoring Algorithm
 *
 * Computes a weighted composite score (1-100) for each insight.
 * Score tiers:
 *   80-100: Strong (green) — high priority, actionable
 *   50-79:  Medium (amber) — worth reviewing
 *   1-49:   Low (gray)     — informational
 */

import type { ScoringHints } from "./rules/types";

// Weights for each scoring dimension
const WEIGHTS = {
  financialImpact: 0.30,
  dataConfidence: 0.25,
  urgency: 0.20,
  actionClarity: 0.15,
  customerFit: 0.10,
} as const;

/**
 * Compute the weighted composite score from scoring hints.
 */
export function computeScore(hints: ScoringHints): number {
  const raw =
    hints.financialImpact * WEIGHTS.financialImpact +
    hints.dataConfidence * WEIGHTS.dataConfidence +
    hints.urgency * WEIGHTS.urgency +
    hints.actionClarity * WEIGHTS.actionClarity +
    hints.customerFit * WEIGHTS.customerFit;

  return Math.round(Math.max(1, Math.min(100, raw)));
}

/**
 * Convert AI-generated impact labels to numeric scores.
 */
export function impactToScore(impact: "low" | "medium" | "high"): number {
  switch (impact) {
    case "high":
      return 85;
    case "medium":
      return 55;
    case "low":
      return 25;
  }
}

/**
 * Convert urgency level (0-2) to score.
 */
export function urgencyToScore(level: 0 | 1 | 2): number {
  switch (level) {
    case 2:
      return 90;
    case 1:
      return 55;
    case 0:
      return 20;
  }
}

/**
 * Compute scoring hints for AI-generated insights.
 */
export function computeAIInsightHints(params: {
  estimatedFinancialImpact: "low" | "medium" | "high";
  urgencyLevel: 0 | 1 | 2;
  evidenceCount: number;
  dataFreshness: number; // 0=stale, 1=partial, 2=fresh
}): ScoringHints {
  return {
    financialImpact: impactToScore(params.estimatedFinancialImpact),
    dataConfidence: Math.min(90, 40 + params.dataFreshness * 20 + params.evidenceCount * 5),
    urgency: urgencyToScore(params.urgencyLevel),
    actionClarity: 55, // AI insights are generally less actionable than deterministic rules
    customerFit: Math.min(80, 30 + params.evidenceCount * 10),
  };
}
