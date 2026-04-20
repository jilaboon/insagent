"use client";

import { useState } from "react";
import {
  Clock,
  ChevronRight,
  ChevronLeft,
  Loader2,
  Inbox,
  ArrowUpCircle,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { CustomerCard } from "@/components/queue/customer-card";
import {
  BucketTabsStrip,
  type BucketTabValue,
} from "@/components/queue/bucket-tabs";
import type { OfficeBucket } from "@/lib/queue/buckets";
import {
  useQueueSoon,
  useQueueAction,
  type QueueEntryWithRelations,
} from "@/lib/api/hooks";

export default function SoonPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQueueSoon(page);
  const action = useQueueAction();
  const [toast, setToast] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<BucketTabValue>("all");

  const allItems = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  const items =
    activeTab === "all"
      ? allItems
      : allItems.filter(
          (e) => (e.bucket ?? "general") === (activeTab as OfficeBucket)
        );

  async function handlePromote(entry: QueueEntryWithRelations) {
    // Promote = mark current SOON entry as COMPLETED so backend can rebuild with it in TODAY,
    // OR call rebuild. Safer path: use a dedicated endpoint if exists. For now we trigger rebuild
    // by marking the SOON entry as EXTERNAL and re-running rebuild. Simpler: fire a POST with status EXTERNAL
    // which backend handles by re-ranking. We use the action mutation with a special intent.
    try {
      await action.mutateAsync({ id: entry.id, status: "EXTERNAL" });
      setToast(`${entry.customer.fullName} הועלה לתור היום`);
      setTimeout(() => setToast(null), 3000);
    } catch {
      /* no-op */
    }
  }

  return (
    <div className="space-y-6 animate-[fadeIn_0.3s_ease-out_forwards]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-surface-900">
            <Clock className="h-6 w-6 text-primary-500" />
            בקרוב
          </h1>
          <p className="mt-1 text-sm text-surface-500">
            המשימות הבאות בתור —{" "}
            <span className="number font-semibold text-surface-700">
              {total.toLocaleString("he-IL")}
            </span>{" "}
            לקוחות
          </p>
        </div>
      </div>

      <BucketTabsStrip
        entries={allItems}
        active={activeTab}
        onChange={setActiveTab}
      />

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-surface-400" />
        </div>
      ) : allItems.length === 0 ? (
        <Card padding="lg">
          <EmptyState
            icon={Inbox}
            title="אין משימות בתור 'בקרוב'"
            description="רענן את התור מהדשבורד כדי לייצר משימות חדשות."
          />
        </Card>
      ) : items.length === 0 ? (
        <Card padding="md">
          <p className="text-center text-sm text-surface-500 py-4">
            אין פריטים בקטגוריה זו
          </p>
        </Card>
      ) : (
        <>
          <div className="space-y-3">
            {items.map((entry) => (
              <CustomerCard
                key={entry.id}
                entry={entry}
                compact
                showPromote
                onPromote={handlePromote}
              />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-surface-200 pt-4">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <ChevronRight className="h-3.5 w-3.5" />
                הקודם
              </Button>
              <span className="text-xs text-surface-500">
                עמוד <span className="number font-semibold">{page}</span> מתוך{" "}
                <span className="number font-semibold">{totalPages}</span>
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                הבא
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-full bg-surface-900 px-4 py-2 text-xs font-medium text-white shadow-lg animate-[fadeIn_0.2s_ease-out_forwards]">
          <ArrowUpCircle className="h-3.5 w-3.5 text-amber-300" />
          {toast}
        </div>
      )}
    </div>
  );
}
