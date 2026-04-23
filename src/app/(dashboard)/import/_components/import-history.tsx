"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/utils";
import { useEffect, useState } from "react";

interface ImportJobRow {
  id: string;
  fileName: string;
  fileType: string;
  status: string;
  totalRows: number | null;
  importedRows: number | null;
  failedRows: number | null;
  newCustomers: number | null;
  updatedCustomers: number | null;
  createdAt: string;
  completedAt: string | null;
}

const statusMap: Record<string, { label: string; variant: "success" | "warning" | "danger" | "default" | "info" }> = {
  COMPLETED: { label: "הושלם", variant: "success" },
  PROCESSING: { label: "בעיבוד", variant: "info" },
  PENDING: { label: "ממתין", variant: "default" },
  FAILED: { label: "נכשל", variant: "danger" },
  PARTIAL: { label: "חלקי", variant: "warning" },
};

// Map the raw fileType string (as stored on ImportJob) to a human-facing
// source label + tone. BAFI uploads currently store life/elementary/unknown
// (legacy), while Har HaBituach uploads store "har_habituach".
function sourceMetaFor(fileType: string): {
  label: string;
  tone: "indigo" | "violet" | "surface";
} {
  const t = (fileType || "").toLowerCase();
  if (t === "har_habituach") {
    return { label: "הר הביטוח", tone: "violet" };
  }
  if (t === "life" || t === "elementary" || t.startsWith("bafi")) {
    return { label: "BAFI", tone: "indigo" };
  }
  return { label: "אחר", tone: "surface" };
}

interface ImportHistoryProps {
  refreshKey?: number;
  className?: string;
}

export function ImportHistory({ refreshKey, className }: ImportHistoryProps) {
  const [jobs, setJobs] = useState<ImportJobRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      try {
        const res = await fetch("/api/import/history");
        if (!res.ok) return;
        const data = await res.json();
        if (active) setJobs(data);
      } catch {
        // Ignore
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => { active = false; };
  }, [refreshKey]);

  if (loading) {
    return (
      <div className={cn("space-y-3", className)}>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="skeleton h-14 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-surface-500">
        אין היסטוריית ייבוא
      </p>
    );
  }

  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full text-sm table-fixed">
        <thead>
          <tr className="border-b border-surface-200">
            <th className="w-[14%] py-3 px-4 font-medium text-surface-500 text-right">
              מקור
            </th>
            <th className="w-[34%] py-3 px-4 font-medium text-surface-500 text-right">
              שם קובץ
            </th>
            <th className="w-[19%] py-3 px-4 font-medium text-surface-500 text-right">
              תאריך
            </th>
            <th className="w-[18%] py-3 px-4 font-medium text-surface-500 text-right">
              סטטוס
            </th>
            <th className="w-[15%] py-3 px-4 font-medium text-surface-500 text-right">
              לקוחות
            </th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => {
            const status =
              statusMap[job.status] ?? { label: job.status, variant: "default" as const };
            const customerCount =
              (job.newCustomers ?? 0) + (job.updatedCustomers ?? 0);
            const source = sourceMetaFor(job.fileType);

            return (
              <tr
                key={job.id}
                className="border-b border-surface-100 hover:bg-surface-50 transition-colors"
              >
                <td className="py-3 px-4 text-right">
                  <SourceBadge tone={source.tone} label={source.label} />
                </td>
                <td className="py-3 px-4 text-surface-800 truncate text-right">
                  {job.fileName}
                </td>
                <td className="py-3 px-4 text-surface-600 number text-right">
                  {formatDate(job.createdAt)}
                </td>
                <td className="py-3 px-4 text-right">
                  <Badge variant={status.variant}>{status.label}</Badge>
                </td>
                <td className="py-3 px-4 text-surface-600 number text-right">
                  {customerCount > 0 ? customerCount.toLocaleString("he-IL") : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SourceBadge({
  tone,
  label,
}: {
  tone: "indigo" | "violet" | "surface";
  label: string;
}) {
  const toneClass =
    tone === "violet"
      ? "bg-violet-500/12 text-violet-700 border-violet-300/50"
      : tone === "indigo"
        ? "bg-indigo-500/12 text-indigo-700 border-indigo-300/50"
        : "bg-surface-100 text-surface-600 border-surface-200";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
        toneClass
      )}
    >
      {label}
    </span>
  );
}
