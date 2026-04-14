"use client";

import { Suspense, useState, useCallback, useRef } from "react";
import { Lightbulb, AlertTriangle, MessageSquare, Sparkles, Loader2, Square } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/progress-bar";
import { useInsights } from "@/lib/api/hooks";
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
// Generate Button with batch progress
// ============================================================

function GenerateSection() {
  const [state, setState] = useState<"idle" | "running" | "done">("idle");
  const [progress, setProgress] = useState({ processed: 0, total: 0, insights: 0 });
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef(false);
  const queryClient = useQueryClient();

  const handleGenerate = useCallback(async () => {
    setState("running");
    setError(null);
    abortRef.current = false;
    setProgress({ processed: 0, total: 0, insights: 0 });

    let offset = 0;
    const batchSize = 50;
    let totalInsights = 0;

    try {
      while (true) {
        if (abortRef.current) break;

        const res = await fetch("/api/insights/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ offset, limit: batchSize, includeAI: false }),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "שגיאה");
        }

        const result = (await res.json()) as {
          processed: number;
          insightsCreated: number;
          totalCustomers: number;
          done: boolean;
        };

        totalInsights += result.insightsCreated;
        offset += result.processed;
        setProgress({
          processed: offset,
          total: result.totalCustomers,
          insights: totalInsights,
        });

        if (offset % 500 === 0 || result.done) {
          queryClient.invalidateQueries({ queryKey: ["insights"] });
        }

        if (result.done) break;
      }
    } catch (err) {
      console.error("Generation error:", err);
      setError(err instanceof Error ? err.message : "שגיאה לא צפויה");
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
    setError(null);
  }, []);

  if (state === "done") {
    return (
      <Card padding="sm" className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-emerald-500" />
            <span className="text-sm font-medium text-surface-800">
              הניתוח הושלם
            </span>
          </div>
          <Button variant="secondary" size="sm" onClick={handleReset}>
            סגור
          </Button>
        </div>
        <p className="text-xs text-surface-600 number">
          {progress.processed.toLocaleString("he-IL")} לקוחות נותחו · {progress.insights.toLocaleString("he-IL")} תובנות חדשות נוצרו
        </p>
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
    <Button variant="primary" size="md" onClick={handleGenerate}>
      <Sparkles className="h-4 w-4" />
      צור תובנות
    </Button>
  );
}

// ============================================================
// Main Page
// ============================================================

function InsightsContent() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-surface-900">מרכז תובנות</h1>
          <p className="mt-1 text-sm text-surface-500">
            תובנות עסקיות שזוהו אוטומטית מנתוני הלקוחות
          </p>
        </div>
        <GenerateSection />
      </div>

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
