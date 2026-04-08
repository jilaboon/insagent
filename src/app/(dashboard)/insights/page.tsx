"use client";

import { Suspense } from "react";
import { Lightbulb, AlertTriangle, MessageSquare, Sparkles, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useInsights, useGenerateInsights } from "@/lib/api/hooks";
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
// Generate Button
// ============================================================

function GenerateButton() {
  const generateInsights = useGenerateInsights();

  return (
    <Button
      variant="primary"
      size="md"
      onClick={() => generateInsights.mutate({ includeAI: false })}
      disabled={generateInsights.isPending}
    >
      {generateInsights.isPending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Sparkles className="h-4 w-4" />
      )}
      {generateInsights.isPending ? "מנתח..." : "צור תובנות"}
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
        <GenerateButton />
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
