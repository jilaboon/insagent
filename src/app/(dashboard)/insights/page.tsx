"use client";

import { Suspense, useState, useCallback, useRef } from "react";
import { Lightbulb, AlertTriangle, MessageSquare, Sparkles, Loader2, Square } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/progress-bar";
import { useInsights, useDashboardStats } from "@/lib/api/hooks";
import { useQueryClient } from "@tanstack/react-query";
import { InsightsFilters, useFiltersFromURL } from "./_components/insights-filters";
import { InsightsTable } from "./_components/insights-table";

// ============================================================
// Stats Header
// ============================================================

function InsightsStats() {
  const filters = useFiltersFromURL();
  const { data } = useInsights(filters);

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const highUrgency = items.filter((i) => i.urgencyLevel === 2).length;
  const pendingMessages = items.filter(
    (i) => i.messageStatus === "none" || i.messageStatus === "draft"
  ).length;

  return (
    <div className="flex gap-4">
      <StatCard
        icon={<Lightbulb className="h-4 w-4 text-primary-500" />}
        label="סה״כ תובנות"
        value={total}
      />
      <StatCard
        icon={<AlertTriangle className="h-4 w-4 text-red-500" />}
        label="דחיפות גבוהה"
        value={highUrgency}
        accent={highUrgency > 0 ? "danger" : undefined}
      />
      <StatCard
        icon={<MessageSquare className="h-4 w-4 text-amber-500" />}
        label="ממתינות להודעה"
        value={pendingMessages}
      />
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  accent?: "danger";
}) {
  return (
    <Card padding="sm" className="flex min-w-32 items-center gap-3">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-50">
        {icon}
      </div>
      <div>
        <p className="text-xs text-surface-500">{label}</p>
        <p
          className={`text-lg font-bold number ${accent === "danger" && value > 0 ? "text-red-600" : "text-surface-900"}`}
        >
          {value}
        </p>
      </div>
    </Card>
  );
}

// ============================================================
// Generate Button (animates when new rules/data exist)
// ============================================================

function NeedsRerunGenerateButton({ onGenerate }: { onGenerate: () => void }) {
  const { data } = useDashboardStats();
  const needsRerun = data?.needsRerun ?? false;

  return (
    <Button
      variant="primary"
      size="md"
      onClick={onGenerate}
      className={needsRerun ? "animate-pulse" : ""}
    >
      <Sparkles className="h-4 w-4" />
      צור תובנות
    </Button>
  );
}

// ============================================================
// Generate Button with batch progress
// ============================================================

interface RuleSummaryItem {
  ruleId: string;
  title: string;
  triggerCondition: string | null;
  insightCount: number;
  coveragePercent: number;
}

function GenerateSection() {
  const [state, setState] = useState<"idle" | "running" | "done">("idle");
  const [progress, setProgress] = useState({ processed: 0, total: 0, insights: 0 });
  const [ruleSummary, setRuleSummary] = useState<RuleSummaryItem[]>([]);
  const [totalInsightsInDb, setTotalInsightsInDb] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [showBroadWarning, setShowBroadWarning] = useState(true);
  const abortRef = useRef(false);
  const queryClient = useQueryClient();

  const handleGenerate = useCallback(async () => {
    setState("running");
    setError(null);
    abortRef.current = false;
    setProgress({ processed: 0, total: 0, insights: 0 });

    let offset = 0;
    const batchSize = 2000; // Large batches — functions run in Frankfurt near DB
    let totalInsights = 0;

    try {
      while (true) {
        if (abortRef.current) break;

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 120000); // 2min timeout per batch

        const res = await fetch("/api/insights/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ offset, limit: batchSize }),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!res.ok) {
          const errData = await res.json().catch(() => ({ error: "שגיאת שרת" }));
          throw new Error(errData.error || "שגיאה");
        }

        const result = (await res.json()) as {
          processed: number;
          insightsCreated: number;
          totalCustomers: number;
          done: boolean;
          totalInsights?: number;
          ruleSummary?: RuleSummaryItem[];
        };

        totalInsights += result.insightsCreated;
        offset += result.processed;
        setProgress({
          processed: offset,
          total: result.totalCustomers,
          insights: totalInsights,
        });

        queryClient.invalidateQueries({ queryKey: ["insights"] });

        if (result.done) {
          if (result.ruleSummary) setRuleSummary(result.ruleSummary);
          if (result.totalInsights) setTotalInsightsInDb(result.totalInsights);
          break;
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setError("הפעולה ארכה יותר מדי זמן — נסה שוב");
      } else {
        console.error("Generation error:", err);
        setError(err instanceof Error ? err.message : "שגיאה לא צפויה");
      }
    }

    queryClient.invalidateQueries({ queryKey: ["insights"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    setState("done");
  }, [queryClient]);

  const handleStop = useCallback(() => {
    abortRef.current = true;
  }, []);

  const handleReset = useCallback(() => {
    setState("idle");
    setProgress({ processed: 0, total: 0, insights: 0 });
    setRuleSummary([]);
    setError(null);
    setShowDetails(false);
    setShowBroadWarning(true);
  }, []);

  const handleToggleRule = useCallback(async (ruleId: string, currentlyActive: boolean) => {
    try {
      await fetch(`/api/rules/${ruleId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !currentlyActive }),
      });
      setRuleSummary((prev) =>
        prev.map((r) => r.ruleId === ruleId ? { ...r, _disabled: true } as RuleSummaryItem & { _disabled?: boolean } : r)
      );
    } catch { /* ignore */ }
  }, []);

  if (state === "done") {
    const broadRules = ruleSummary.filter((r) => r.coveragePercent > 50);

    return (
      <Card padding="md" className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-emerald-500" />
            <span className="text-sm font-bold text-surface-800">
              הניתוח הושלם
            </span>
          </div>
          <Button variant="secondary" size="sm" onClick={handleReset}>
            סגור
          </Button>
        </div>

        {/* Summary stats */}
        <div className="flex gap-6 text-sm">
          <div>
            <span className="text-surface-500">תובנות:</span>{" "}
            <span className="font-bold text-surface-900 number">{totalInsightsInDb.toLocaleString("he-IL")}</span>
          </div>
          <div>
            <span className="text-surface-500">לקוחות:</span>{" "}
            <span className="font-bold text-surface-900 number">{progress.total.toLocaleString("he-IL")}</span>
          </div>
          <div>
            <span className="text-surface-500">ממוצע לכל לקוח:</span>{" "}
            <span className="font-bold text-surface-900 number">
              {progress.total > 0 ? (totalInsightsInDb / progress.total).toFixed(1) : "0"}
            </span>
          </div>
        </div>

        {/* Broad rules warning — dismissible */}
        {broadRules.length > 0 && showBroadWarning && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <span className="text-sm font-bold text-amber-800">
                  {broadRules.length} חוקים מתאימים ליותר מ-50% מהלקוחות
                </span>
              </div>
              <button
                onClick={() => setShowBroadWarning(false)}
                className="text-xs text-amber-600 hover:text-amber-800 shrink-0"
              >
                סגור
              </button>
            </div>
            <div className="space-y-1.5">
              {broadRules.map((r) => (
                <div key={r.ruleId} className="flex items-center justify-between text-xs">
                  <span className="text-amber-900 truncate">
                    {r.title} <span className="text-amber-600 number">({r.coveragePercent}%)</span>
                  </span>
                  <button
                    onClick={() => handleToggleRule(r.ruleId, true)}
                    className="shrink-0 text-amber-700 hover:text-red-600 underline mr-2"
                  >
                    בטל חוק
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Expand details link + restore warning */}
        {ruleSummary.length > 0 && (
          <div className="flex items-center gap-4 text-xs">
            <button
              onClick={() => setShowDetails((v) => !v)}
              className="text-primary-600 hover:text-primary-700 font-medium"
            >
              {showDetails ? "הסתר פירוט" : "הצג פירוט מלא לפי חוק"} ↓
            </button>
            {broadRules.length > 0 && !showBroadWarning && (
              <button
                onClick={() => setShowBroadWarning(true)}
                className="text-amber-600 hover:text-amber-700 font-medium"
              >
                הצג אזהרת חוקים רחבים ({broadRules.length})
              </button>
            )}
          </div>
        )}

        {/* Full rule breakdown — only when expanded */}
        {showDetails && ruleSummary.length > 0 && (
          <div className="rounded-lg border border-surface-200 overflow-hidden">
            <table className="w-full text-xs table-fixed">
              <thead>
                <tr className="bg-surface-50 border-b border-surface-200">
                  <th className="w-[55%] py-2 px-3 text-right font-medium text-surface-500">חוק</th>
                  <th className="w-[20%] py-2 px-3 text-right font-medium text-surface-500">תובנות</th>
                  <th className="w-[15%] py-2 px-3 text-right font-medium text-surface-500">כיסוי</th>
                  <th className="w-[10%] py-2 px-3 text-right font-medium text-surface-500"></th>
                </tr>
              </thead>
              <tbody>
                {ruleSummary.map((r) => (
                  <tr key={r.ruleId} className="border-b border-surface-100 hover:bg-surface-50">
                    <td className="py-2 px-3 text-surface-800 truncate">{r.title}</td>
                    <td className="py-2 px-3 text-surface-600 number">{r.insightCount.toLocaleString("he-IL")}</td>
                    <td className="py-2 px-3">
                      <span className={`number font-medium ${r.coveragePercent > 50 ? "text-amber-600" : r.coveragePercent > 20 ? "text-surface-700" : "text-surface-500"}`}>
                        {r.coveragePercent}%
                      </span>
                    </td>
                    <td className="py-2 px-3">
                      <button
                        onClick={() => handleToggleRule(r.ruleId, true)}
                        className="text-xs text-red-600 hover:text-white hover:bg-red-500 border border-red-200 rounded px-2 py-0.5 transition-colors"
                        title="בטל חוק"
                      >
                        בטל
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {error && <p className="text-xs text-red-500">{error}</p>}
      </Card>
    );
  }

  if (state === "running") {
    const percent = progress.total > 0
      ? Math.round((progress.processed / progress.total) * 100)
      : 2; // Start at 2% so the bar is visible immediately

    return (
      <Card padding="sm" className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-primary-500" />
            <span className="text-sm font-medium text-surface-800">
              {progress.total > 0 ? "מנתח לקוחות..." : "מתחיל ניתוח..."}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-surface-500 number">
              {progress.total > 0
                ? `${progress.processed.toLocaleString("he-IL")} / ${progress.total.toLocaleString("he-IL")} · ${progress.insights.toLocaleString("he-IL")} תובנות`
                : "טוען נתוני לקוחות..."}
            </span>
            <Button variant="danger" size="sm" onClick={handleStop}>
              <Square className="h-3 w-3" />
              עצור
            </Button>
          </div>
        </div>
        <ProgressBar value={percent} variant="primary" />
      </Card>
    );
  }

  return (
    <NeedsRerunGenerateButton onGenerate={handleGenerate} />
  );
}

// ============================================================
// Main Page
// ============================================================

function InsightsContent() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-surface-900">חקור תובנות</h1>
            <p className="mt-1 text-sm text-surface-500">
              כל התובנות במערכת — לחקירה מעמיקה
            </p>
          </div>
        </div>
      </div>

      {/* Generate section — full width, separate from header */}
      <GenerateSection />

      {/* Stats */}
      <InsightsStats />

      {/* Filters */}
      <InsightsFilters />

      {/* Table */}
      <InsightsTable />
    </div>
  );
}

export default function InsightsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-surface-400" />
        </div>
      }
    >
      <InsightsContent />
    </Suspense>
  );
}
