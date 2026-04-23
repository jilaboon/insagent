"use client";

import { useState } from "react";
import Link from "next/link";
import {
  BucketTabsStrip,
  filterEntriesByTab,
  type BucketTabValue,
} from "@/components/queue/bucket-tabs";
import {
  RefreshCw,
  Inbox,
  Upload,
  MessageSquare,
  Lightbulb,
  Clock,
  CheckCircle2,
  Loader2,
  FileText,
  Sparkles,
  Users,
} from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { CustomerCard } from "@/components/queue/customer-card";
import {
  useQueueToday,
  useQueueStats,
  useRebuildQueue,
  useDashboardStats,
} from "@/lib/api/hooks";
import { timeAgo } from "@/lib/utils";

export default function DashboardPage() {
  const today = useQueueToday();
  const stats = useQueueStats();
  const dashboardStats = useDashboardStats();
  const rebuild = useRebuildQueue();
  const [toast, setToast] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<BucketTabValue>("all");

  const allEntries = today.data?.items ?? [];
  const lastRebuildAt = stats.data?.lastRebuildAt ?? null;
  const totalCustomers = dashboardStats.data?.totalCustomers ?? 0;
  const totalInsights = dashboardStats.data?.totalInsights ?? 0;

  const entries = filterEntriesByTab(allEntries, activeTab);

  async function handleRebuild() {
    try {
      await rebuild.mutateAsync({ reason: "MANUAL_REFRESH" });
      setToast("התור עודכן בהצלחה");
      setTimeout(() => setToast(null), 3000);
    } catch {
      /* handled via mutation state */
    }
  }

  return (
    <div className="space-y-6 animate-[fadeIn_0.3s_ease-out_forwards]">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-light tracking-tight text-surface-900 sm:text-4xl">
            העבודה של{" "}
            <span
              className="bg-gradient-to-l from-indigo-500 via-violet-500 to-rose-400 bg-clip-text text-transparent"
              style={{ WebkitTextFillColor: "transparent" }}
            >
              היום
            </span>
          </h1>
          <p className="mt-1.5 text-sm text-surface-600">
            {today.isLoading ? (
              "טוען..."
            ) : (
              <>
                <span className="number">{allEntries.length}</span> משימות מחכות לך
                <span className="mx-2 text-surface-400">·</span>
                עודכן: {timeAgo(lastRebuildAt)}
              </>
            )}
          </p>
        </div>
        <Button
          variant="secondary"
          size="md"
          onClick={handleRebuild}
          disabled={rebuild.isPending}
        >
          {rebuild.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          {rebuild.isPending ? "מעדכן..." : "רענן תור"}
        </Button>
      </div>

      {/* Main 70/30 layout */}
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Main list */}
        <div className="min-w-0 space-y-3">
          {/* Bucket tabs */}
          <BucketTabsStrip
            entries={allEntries}
            active={activeTab}
            onChange={setActiveTab}
          />

          {today.isLoading ? (
            <QueueListSkeleton />
          ) : allEntries.length === 0 ? (
            <EmptyQueueState
              onRebuild={handleRebuild}
              isBuilding={rebuild.isPending}
              totalCustomers={totalCustomers}
              totalInsights={totalInsights}
            />
          ) : entries.length === 0 ? (
            <Card padding="md">
              <p className="text-center text-sm text-surface-500 py-4">
                אין פריטים בקטגוריה זו היום
              </p>
            </Card>
          ) : (
            entries.map((entry) => (
              <CustomerCard key={entry.id} entry={entry} />
            ))
          )}
        </div>

        {/* Side strip */}
        <aside className="space-y-4">
          <Card padding="md">
            <CardHeader>
              <CardTitle>
                <span className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary-500" />
                  סטטוס מערכת
                </span>
              </CardTitle>
            </CardHeader>
            <div className="space-y-3">
              <SideLink
                icon={<MessageSquare className="h-4 w-4 text-amber-500" />}
                label="הודעות ממתינות לאישור"
                value={stats.data?.pendingApprovals ?? 0}
                href="/insights?messageStatus=draft"
              />
              <SideLink
                icon={<Lightbulb className="h-4 w-4 text-sky-500" />}
                label="תובנות סך הכל"
                value={null}
                href="/insights"
                caption="עבור לחקירת תובנות"
              />
              <div className="pt-2 border-t border-white/60">
                <p className="text-[11px] text-surface-600">עדכון אחרון</p>
                <p className="mt-0.5 text-sm font-medium text-surface-800">
                  {timeAgo(lastRebuildAt)}
                </p>
              </div>
            </div>
          </Card>

          <Card padding="md">
            <CardHeader>
              <CardTitle>
                <span className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-primary-500" />
                  ניהול התור
                </span>
              </CardTitle>
            </CardHeader>
            <div className="space-y-3">
              <SideLink
                icon={<Clock className="h-4 w-4 text-amber-500" />}
                label="בקרוב"
                value={stats.data?.soonCount ?? 0}
                href="/soon"
              />
              <SideLink
                icon={<CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                label="הושלמו היום"
                value={stats.data?.completedToday ?? 0}
                href="#"
              />
            </div>
          </Card>

          <Card padding="md">
            <CardHeader>
              <CardTitle>
                <span className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-surface-400" />
                  פעולות מהירות
                </span>
              </CardTitle>
            </CardHeader>
            <div className="flex flex-col gap-2">
              <Link
                href="/import"
                className="inline-flex items-center gap-2 rounded-lg border border-white/65 bg-white/60 px-3 py-2 text-xs font-medium text-surface-700 backdrop-blur-md transition-colors hover:border-violet-300/60 hover:bg-white/75 hover:text-violet-700"
              >
                <Upload className="h-3.5 w-3.5" />
                יבוא קובץ BAFI
              </Link>
              <Link
                href="/rules"
                className="inline-flex items-center gap-2 rounded-lg border border-white/65 bg-white/60 px-3 py-2 text-xs font-medium text-surface-700 backdrop-blur-md transition-colors hover:border-violet-300/60 hover:bg-white/75 hover:text-violet-700"
              >
                <Lightbulb className="h-3.5 w-3.5" />
                מנוע חוקים
              </Link>
            </div>
          </Card>
        </aside>
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-surface-900 px-4 py-2 text-xs font-medium text-white shadow-lg animate-[fadeIn_0.2s_ease-out_forwards]">
          {toast}
        </div>
      )}
    </div>
  );
}

function SideLink({
  icon,
  label,
  value,
  href,
  caption,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | null;
  href: string;
  caption?: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-lg px-2 py-1.5 -mx-2 hover:bg-white/50 transition-colors"
    >
      <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/60 bg-white/55 backdrop-blur-md">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-surface-600">{label}</p>
        {caption && (
          <p className="text-[11px] text-surface-500 truncate">{caption}</p>
        )}
      </div>
      {value != null && (
        <span className="text-sm font-semibold text-surface-900 number">
          {value.toLocaleString("he-IL")}
        </span>
      )}
    </Link>
  );
}

function QueueListSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="rounded-[20px] border border-white/65 bg-white/55 p-5 backdrop-blur-xl"
        >
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 shrink-0 rounded-full bg-white/60 animate-pulse" />
            <div className="flex-1 space-y-2">
              <div className="h-5 w-44 rounded bg-white/60 animate-pulse" />
              <div className="h-3 w-64 rounded bg-white/50 animate-pulse" />
              <div className="h-3 w-3/4 rounded bg-white/50 animate-pulse" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyQueueState({
  onRebuild,
  isBuilding,
  totalCustomers,
  totalInsights,
}: {
  onRebuild: () => void;
  isBuilding: boolean;
  totalCustomers: number;
  totalInsights: number;
}) {
  // State 1: No customers yet — first-time user flow
  if (totalCustomers === 0) {
    return (
      <Card padding="lg">
        <EmptyState
          icon={Users}
          title="עדיין אין לקוחות במערכת"
          description="כדי להתחיל, יבא קובץ BAFI. המערכת תנתח את הלקוחות ותכין לך רשימה ממוקדת של משימות."
          action={
            <Link
              href="/import"
              className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
            >
              <Upload className="h-4 w-4" />
              יבא קובץ BAFI
            </Link>
          }
        />
      </Card>
    );
  }

  // State 2: Customers exist but no insights — need to run analysis
  if (totalInsights === 0) {
    return (
      <Card padding="lg">
        <EmptyState
          icon={Lightbulb}
          title="יש לקוחות, אבל עדיין לא נוצרו תובנות"
          description={`${totalCustomers.toLocaleString("he-IL")} לקוחות במערכת. לחץ כאן כדי שה-AI יזהה הזדמנויות ויבנה את התור.`}
          action={
            <Link
              href="/insights"
              className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
            >
              <Sparkles className="h-4 w-4" />
              עבור לייצור תובנות
            </Link>
          }
        />
      </Card>
    );
  }

  // State 3: Data + insights exist, queue hasn't been built yet
  return (
    <Card padding="lg">
      <EmptyState
        icon={Inbox}
        title="התור לא נבנה עדיין"
        description={`${totalInsights.toLocaleString("he-IL")} תובנות מחכות להיבחר. לחץ כדי לבנות את רשימת המשימות של היום.`}
        action={
          <Button
            variant="primary"
            size="md"
            onClick={onRebuild}
            disabled={isBuilding}
          >
            {isBuilding ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            בנה את התור
          </Button>
        }
      />
    </Card>
  );
}

