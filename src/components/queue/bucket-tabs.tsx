"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { OFFICE_BUCKET_LABELS, type OfficeBucket } from "@/lib/queue/buckets";
import type { QueueEntryWithRelations } from "@/lib/api/hooks";

export type BucketTabValue = OfficeBucket | "all";

interface BucketTabsStripProps {
  entries: QueueEntryWithRelations[];
  active: BucketTabValue;
  onChange: (next: BucketTabValue) => void;
}

export function BucketTabsStrip({
  entries,
  active,
  onChange,
}: BucketTabsStripProps) {
  const counts = useMemo(() => {
    const c: Record<OfficeBucket, number> = {
      coverage: 0,
      savings: 0,
      service: 0,
      general: 0,
      renewal: 0,
    };
    for (const e of entries) {
      const b = e.bucket ?? "general";
      c[b] = (c[b] ?? 0) + 1;
    }
    return c;
  }, [entries]);

  if (entries.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-surface-200/80 bg-white/55 p-1.5 backdrop-blur-md">
      <Tab
        label="הכל"
        count={entries.length}
        active={active === "all"}
        onClick={() => onChange("all")}
        tone="all"
      />
      {(["coverage", "savings", "service", "general"] as const).map((b) => (
        <Tab
          key={b}
          label={OFFICE_BUCKET_LABELS[b]}
          count={counts[b]}
          active={active === b}
          onClick={() => onChange(b)}
          tone={b}
        />
      ))}
    </div>
  );
}

function Tab({
  label,
  count,
  active,
  onClick,
  tone,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  tone: "all" | "coverage" | "savings" | "service" | "general";
}) {
  const activeTone =
    tone === "coverage"
      ? "bg-indigo-500/15 text-indigo-700 border-indigo-300/60"
      : tone === "savings"
        ? "bg-cyan-500/15 text-cyan-700 border-cyan-300/60"
        : tone === "service"
          ? "bg-violet-500/15 text-violet-700 border-violet-300/60"
          : tone === "general"
            ? "bg-rose-500/15 text-rose-700 border-rose-300/60"
            : "bg-surface-900 text-white border-surface-900";

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all",
        active
          ? activeTone
          : "border-transparent bg-transparent text-surface-600 hover:bg-white/65 hover:text-surface-800"
      )}
    >
      <span>{label}</span>
      <span
        className={cn(
          "number text-[10px] tabular-nums rounded-full px-1.5 py-0.5",
          active
            ? tone === "all"
              ? "bg-white/20"
              : "bg-white/50"
            : "bg-surface-200/60"
        )}
      >
        {count}
      </span>
    </button>
  );
}
