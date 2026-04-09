"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { MessageComposer } from "@/components/shared/message-composer";
import type { InsightDetail } from "@/lib/types/insight";

interface InsightRowDetailProps {
  insight: InsightDetail;
  className?: string;
}

export function InsightRowDetail({ insight, className }: InsightRowDetailProps) {
  const hasMessage = insight.messageStatus !== "none";

  return (
    <div
      className={cn(
        "space-y-4 border-t border-surface-100 bg-surface-50/50 px-6 py-4",
        className
      )}
    >
      {/* Evidence & explanation */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Left column: explanation */}
        <div className="space-y-2">
          {insight.explanation && (
            <div>
              <h4 className="mb-1 text-xs font-semibold text-surface-500">
                הסבר
              </h4>
              <p className="text-sm leading-relaxed text-surface-700">
                {insight.explanation}
              </p>
            </div>
          )}
          {insight.whyNow && (
            <div>
              <h4 className="mb-1 text-xs font-semibold text-surface-500">
                למה עכשיו?
              </h4>
              <p className="text-sm leading-relaxed text-surface-700">
                {insight.whyNow}
              </p>
            </div>
          )}
        </div>

        {/* Right column: score breakdown + context */}
        <div className="space-y-3">
          <div>
            <h4 className="mb-1.5 text-xs font-semibold text-surface-500">
              פירוט ציון
            </h4>
            <div className="flex flex-wrap gap-2">
              <ScoreChip label="ציון חוזק" value={insight.strengthScore} />
              <ScoreChip label="עדכניות" value={insight.dataFreshness ?? 0} />
              <ScoreChip
                label="שלמות פרופיל"
                value={insight.profileCompleteness ?? 0}
              />
            </div>
          </div>

          {insight.evidenceJson &&
            Object.keys(insight.evidenceJson).length > 0 && (
              <div>
                <h4 className="mb-1.5 text-xs font-semibold text-surface-500">
                  ראיות
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(insight.evidenceJson).map(([key, val]) => (
                    <Badge key={key} variant="muted">
                      {key}: {String(val)}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

          <div className="flex items-center gap-3 text-xs text-surface-500">
            <span>
              מקור: {insight.generatedBy === "ai" ? "בינה מלאכותית" : "מנוע חוקים"}
            </span>
          </div>
        </div>
      </div>

      {/* Message composer */}
      <div className="border-t border-surface-100 pt-3">
        <MessageComposer
          insightId={insight.id}
          customerName={insight.customerName}
          existingMessage={
            hasMessage && (insight as Record<string, unknown>).messageBody
              ? {
                  id: ((insight as Record<string, unknown>).messageId as string) || insight.id,
                  customerId: insight.customerId,
                  customerName: insight.customerName,
                  insightId: insight.id,
                  insightTitle: insight.title,
                  body: (insight as Record<string, unknown>).messageBody as string,
                  tone: null,
                  purpose: null,
                  status: insight.messageStatus === "approved" ? "APPROVED" : "DRAFT",
                  generatedBy: insight.generatedBy,
                  createdAt: insight.createdAt,
                  updatedAt: insight.createdAt,
                }
              : null
          }
        />
      </div>
    </div>
  );
}

// ============================================================
// Score Chip
// ============================================================

function ScoreChip({ label, value }: { label: string; value: number }) {
  const color =
    value >= 80
      ? "text-emerald-700 bg-emerald-50"
      : value >= 50
        ? "text-amber-700 bg-amber-50"
        : "text-surface-600 bg-surface-100";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium",
        color
      )}
    >
      <span className="text-[10px] text-surface-400">{label}</span>
      <span className="number">{value}</span>
    </span>
  );
}
