"use client";

import { ProgressBar } from "@/components/ui/progress-bar";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

interface ImportJob {
  id: string;
  status: string;
  totalRows: number | null;
  importedRows: number | null;
  failedRows: number | null;
  newCustomers: number | null;
  updatedCustomers: number | null;
  customerCount: number;
  policyCount: number;
  errorLog: string[] | null;
}

interface ImportProgressProps {
  jobId: string;
  onComplete: (job: ImportJob) => void;
  className?: string;
}

export function ImportProgress({
  jobId,
  onComplete,
  className,
}: ImportProgressProps) {
  const [job, setJob] = useState<ImportJob | null>(null);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      try {
        const res = await fetch(`/api/import/${jobId}`);
        if (!res.ok) return;
        const data: ImportJob = await res.json();
        if (!active) return;

        setJob(data);

        if (data.status === "COMPLETED" || data.status === "FAILED") {
          onComplete(data);
          return;
        }
      } catch {
        // Retry on next tick
      }

      if (active) {
        timer = setTimeout(poll, 2000);
      }
    }

    poll();

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [jobId, onComplete]);

  const total = job?.totalRows ?? 0;
  const imported = job?.importedRows ?? 0;
  const percent = total > 0 ? Math.round((imported / total) * 100) : 0;

  return (
    <div
      className={cn(
        "rounded-xl border border-surface-200 bg-white p-6",
        className
      )}
    >
      <div className="mb-4 flex items-center gap-3">
        <Loader2 className="h-5 w-5 animate-spin text-primary-600" />
        <h3 className="text-sm font-semibold text-surface-900">
          מעבד נתונים...
        </h3>
      </div>

      <ProgressBar value={percent} variant="primary" className="mb-3" />

      <div className="flex items-center justify-between text-xs text-surface-500">
        <span>
          {total > 0 ? (
            <>
              מעבד...{" "}
              <span className="number font-medium text-surface-700">
                {imported}
              </span>{" "}
              מתוך{" "}
              <span className="number font-medium text-surface-700">
                {total}
              </span>{" "}
              לקוחות
            </>
          ) : (
            "מאתחל ייבוא..."
          )}
        </span>
        <span className="number font-medium">{percent}%</span>
      </div>
    </div>
  );
}
