"use client";

import { Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScoreBadge } from "@/components/shared/score-badge";

// ============================================================
// Score breakdown types — shape matches what the API extracts from
// `evidenceJson.scoreBreakdown`. Kept here so both the customer page
// and the rule-session page can import the type alongside the
// component, instead of redeclaring it locally.
// ============================================================
export type ScoreBoost = { label: string; delta: number };

export type ScoreBreakdown = {
  base: number;
  contextBoosts: ScoreBoost[];
  urgencyBoosts: ScoreBoost[];
  finalScore: number;
};

interface ScoreWithBreakdownProps {
  score: number;
  // Rule title that produced this insight — surfaced in the popover so
  // Rafi can match the score back to the rule that drove it.
  title: string;
  // Older insights (pre-breakdown feature) won't have this. When null
  // we render only the plain badge — no icon, no popover — so the UI
  // never lies about data we don't have.
  breakdown: ScoreBreakdown | null;
  className?: string;
}

/**
 * Score badge + ⓘ icon + hover/focus popover that explains exactly how
 * the strength score was derived: base → context boosts → urgency
 * boosts → final score. Same visual treatment used in the customer
 * detail page and the rule session page so Rafi sees one consistent
 * explanation everywhere a score appears.
 */
export function ScoreWithBreakdown({
  score,
  title,
  breakdown,
  className,
}: ScoreWithBreakdownProps) {
  // No breakdown available — render the plain badge, no popover, no icon.
  if (!breakdown) {
    return <ScoreBadge score={score} className={className} />;
  }

  const hasBoosts =
    breakdown.contextBoosts.length > 0 || breakdown.urgencyBoosts.length > 0;

  return (
    <span
      className={cn(
        "relative inline-flex items-center gap-1 group",
        className
      )}
    >
      <ScoreBadge score={score} />
      <Info
        className="h-3 w-3 text-surface-400 transition-colors group-hover:text-surface-600"
        aria-hidden
      />
      {/* Hover popover — glass/prism styling to match the ambient UI.
          Uses absolute positioning under the badge + pointer-events-none
          on hide so it doesn't block clicks on adjacent elements. */}
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute right-0 top-full z-30 mt-1.5 w-64",
          "rounded-lg border border-white/70 bg-white/90 backdrop-blur-md",
          "px-3 py-2.5 text-right shadow-lg",
          "opacity-0 translate-y-0.5 transition-all duration-150",
          "group-hover:opacity-100 group-hover:translate-y-0",
          "group-focus-within:opacity-100 group-focus-within:translate-y-0"
        )}
        style={{
          boxShadow:
            "0 1px 0 rgba(255,255,255,0.9) inset, 0 8px 24px -8px rgba(80,70,180,0.22)",
        }}
      >
        <p className="mb-1.5 text-[11px] font-semibold text-surface-700">
          איך חושב הציון:
        </p>
        <p className="mb-1 text-[11px] text-surface-600">
          <span>חוק &ldquo;{title}&rdquo; — בסיס: </span>
          <span className="number font-medium text-surface-800">
            {breakdown.base}
          </span>
        </p>
        {hasBoosts && (
          <ul className="mb-1 space-y-0.5">
            {breakdown.contextBoosts.map((b, idx) => (
              <li
                key={`c-${idx}`}
                className="flex items-baseline justify-between gap-2 text-[11px] text-surface-700"
              >
                <span className="truncate">{b.label}</span>
                <span className="number font-medium text-emerald-700">
                  +{b.delta}
                </span>
              </li>
            ))}
            {breakdown.urgencyBoosts.map((b, idx) => (
              <li
                key={`u-${idx}`}
                className="flex items-baseline justify-between gap-2 text-[11px] text-surface-700"
              >
                <span className="truncate">{b.label}</span>
                <span className="number font-medium text-amber-700">
                  +{b.delta}
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-1.5 border-t border-surface-200/70 pt-1.5 text-[11px] font-semibold text-surface-800">
          <span>= </span>
          <span className="number">{breakdown.finalScore}</span>
        </div>
      </span>
    </span>
  );
}
