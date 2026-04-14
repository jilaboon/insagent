"use client";

import { Card, CardHeader, CardTitle, CardValue } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UrgencyIndicator } from "@/components/ui/indicators";
import { ScoreBadge } from "@/components/shared/score-badge";
import { SkeletonCard } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useDashboardStats } from "@/lib/api/hooks";
import { insightCategoryLabels } from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import {
  Users,
  Shield,
  Lightbulb,
  AlertTriangle,
  MessageSquare,
  Upload,
  ChevronLeft,
  FileText,
  Inbox,
} from "lucide-react";
import Link from "next/link";

export default function DashboardPage() {
  const { data, isLoading } = useDashboardStats();

  if (isLoading) {
    return (
      <div className="space-y-8 animate-[fadeIn_0.3s_ease-out_forwards]">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    );
  }

  if (!data || data.totalCustomers === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title="עדיין אין נתונים במערכת"
        description="יש לייבא קובץ BAFI ראשון כדי להתחיל לעבוד עם המערכת"
        action={
          <Link
            href="/import"
            className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
          >
            <Upload className="h-4 w-4" />
            יבוא קובץ ראשון
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-8 animate-[fadeIn_0.3s_ease-out_forwards]">
      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-5">
        <StatCard
          icon={Users}
          label="לקוחות"
          value={data.totalCustomers}
          color="primary"
        />
        <StatCard
          icon={Shield}
          label="פוליסות פעילות"
          value={data.totalPolicies}
          color="success"
        />
        <StatCard
          icon={Lightbulb}
          label="תובנות"
          value={data.totalInsights}
          color="info"
        />
        <StatCard
          icon={AlertTriangle}
          label="דחיפות גבוהה"
          value={data.highUrgencyCount}
          color="danger"
        />
        <StatCard
          icon={MessageSquare}
          label="הודעות ממתינות"
          value={data.pendingMessages}
          color="warning"
        />
      </div>

      {/* Main content — two columns */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Top Insights */}
        <Card>
          <CardHeader>
            <CardTitle>
              <span className="flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-accent-500" />
                תובנות מובילות
              </span>
            </CardTitle>
            <Link
              href="/insights"
              className="flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-700"
            >
              הצג הכל
              <ChevronLeft className="h-3.5 w-3.5" />
            </Link>
          </CardHeader>
          {data.topInsights && data.topInsights.length > 0 ? (
            <div className="space-y-3">
              {data.topInsights.map(
                (insight: {
                  id: string;
                  customerId: string;
                  customerName: string;
                  title: string;
                  strengthScore: number;
                  urgencyLevel: number;
                  category: string;
                }) => (
                  <Link
                    key={insight.id}
                    href={`/customers/${insight.customerId}`}
                    className="flex items-start justify-between rounded-lg border border-surface-100 p-3 transition-colors hover:bg-surface-50"
                  >
                    <div className="flex-1">
                      <div className="mb-1 flex items-center gap-2">
                        <span className="text-sm font-medium text-surface-900">
                          {insight.title}
                        </span>
                        <Badge variant="muted">
                          {insightCategoryLabels[
                            insight.category as keyof typeof insightCategoryLabels
                          ] || insight.category}
                        </Badge>
                      </div>
                      <p className="text-xs text-surface-500">
                        {insight.customerName}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 pr-4">
                      <ScoreBadge score={insight.strengthScore} />
                      <UrgencyIndicator
                        level={insight.urgencyLevel as 0 | 1 | 2}
                      />
                    </div>
                  </Link>
                )
              )}
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-surface-400">
              אין תובנות עדיין — יש להריץ ניתוח לאחר יבוא
            </p>
          )}
        </Card>

        {/* Import Status */}
        <Card>
          <CardHeader>
            <CardTitle>
              <span className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-sky-500" />
                סטטוס יבוא
              </span>
            </CardTitle>
          </CardHeader>
          {data.recentImports && data.recentImports.length > 0 ? (
            <div className="space-y-4">
              {data.recentImports.map((job: { id: string; fileName: string; status: string; createdAt: string; newCustomers: number | null; updatedCustomers: number | null }) => (
                <div key={job.id} className="rounded-lg border border-surface-100 p-3">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-sm font-medium text-surface-900">
                      {job.fileName}
                    </span>
                    <ImportStatusBadge status={job.status} />
                  </div>
                  <div className="flex items-center gap-3 text-xs text-surface-500">
                    <span>{formatDate(job.createdAt)}</span>
                    {job.newCustomers != null && (
                      <span className="number">{job.newCustomers} חדשים</span>
                    )}
                    {job.updatedCustomers != null && job.updatedCustomers > 0 && (
                      <span className="number">{job.updatedCustomers} עודכנו</span>
                    )}
                  </div>
                </div>
              ))}
              <Link
                href="/import"
                className="inline-flex items-center gap-2 rounded-lg border border-surface-300 bg-white px-4 py-2 text-sm font-medium text-surface-700 shadow-xs hover:bg-surface-50"
              >
                <Upload className="h-4 w-4" />
                יבוא חדש
              </Link>
            </div>
          ) : (
            <div className="flex flex-col items-center py-8 text-center">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-surface-100">
                <Upload className="h-5 w-5 text-surface-400" />
              </div>
              <p className="mb-1 text-sm font-medium text-surface-600">
                לא בוצע יבוא עדיין
              </p>
              <p className="mb-4 text-xs text-surface-400">
                יבוא קובץ BAFI כדי להתחיל
              </p>
              <Link
                href="/import"
                className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
              >
                <Upload className="h-4 w-4" />
                יבוא חדש
              </Link>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

// ============================================================
// Stat Card
// ============================================================

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  color: "primary" | "success" | "warning" | "danger" | "info" | "default";
}) {
  const iconColors = {
    primary: "bg-primary-50 text-primary-600",
    success: "bg-emerald-50 text-emerald-600",
    warning: "bg-amber-50 text-amber-600",
    danger: "bg-red-50 text-red-600",
    info: "bg-sky-50 text-sky-600",
    default: "bg-surface-100 text-surface-600",
  };

  return (
    <Card padding="sm">
      <div
        className={`mb-3 flex h-8 w-8 items-center justify-center rounded-lg ${iconColors[color]}`}
      >
        <Icon className="h-4 w-4" />
      </div>
      <CardValue>{value}</CardValue>
      <p className="mt-1 text-xs text-surface-500">{label}</p>
    </Card>
  );
}

// ============================================================
// Import Status Badge
// ============================================================

function ImportStatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; variant: "success" | "warning" | "danger" | "info" | "muted" }> = {
    COMPLETED: { label: "הושלם", variant: "success" },
    PROCESSING: { label: "בעיבוד", variant: "info" },
    PENDING: { label: "ממתין", variant: "warning" },
    FAILED: { label: "נכשל", variant: "danger" },
    PARTIAL: { label: "חלקי", variant: "warning" },
  };

  const c = config[status] || { label: status, variant: "muted" as const };

  return <Badge variant={c.variant}>{c.label}</Badge>;
}
