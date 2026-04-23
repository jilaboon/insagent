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
};

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
            <th className="w-[40%] py-3 px-4 font-medium text-surface-500 text-right">
              שם קובץ
            </th>
            <th className="w-[25%] py-3 px-4 font-medium text-surface-500 text-right">
              תאריך
            </th>
            <th className="w-[20%] py-3 px-4 font-medium text-surface-500 text-right">
              סטטוס
            </th>
            <th className="w-[15%] py-3 px-4 font-medium text-surface-500 text-right">
              לקוחות
            </th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => {
            const status = statusMap[job.status] ?? { label: job.status, variant: "default" as const };
            const customerCount = (job.newCustomers ?? 0) + (job.updatedCustomers ?? 0);

            return (
              <tr
                key={job.id}
                className="border-b border-surface-100 hover:bg-surface-50 transition-colors"
              >
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
