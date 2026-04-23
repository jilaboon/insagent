"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";

interface UploadSuccess {
  importJobId: string;
  totalRows: number;
  validRows: number;
  skippedRows: number;
  customersExisting: number;
  customersCreated: number;
  policiesMatched: number;
  policiesCreated: number;
  insightsCreated: number;
  errorCount: number;
}

interface ActiveJob {
  id: string;
  fileName: string;
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "PARTIAL";
  totalRows: number | null;
  importedRows: number | null;
  newCustomers: number | null;
  updatedCustomers: number | null;
  failedRows: number | null;
  createdAt: string;
  completedAt: string | null;
}

const POLL_INTERVAL_MS = 1500;

export function HarHabituachImport({
  onImportComplete,
}: {
  onImportComplete: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [activeJob, setActiveJob] = useState<ActiveJob | null>(null);
  const [result, setResult] = useState<UploadSuccess | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, []);

  const fetchActive = useCallback(async (): Promise<ActiveJob | null> => {
    try {
      const res = await fetch(
        "/api/import/job/active?fileType=har_habituach",
        { cache: "no-store" }
      );
      if (!res.ok) return null;
      const body = (await res.json()) as { job: ActiveJob | null };
      return body.job;
    } catch {
      return null;
    }
  }, []);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    const tick = async () => {
      const job = await fetchActive();
      if (!isMountedRef.current) return;

      setActiveJob(job);
      if (job && job.status === "PROCESSING") {
        // Still running — schedule the next tick
        pollTimerRef.current = setTimeout(tick, POLL_INTERVAL_MS);
      } else {
        // Finished (COMPLETED / PARTIAL / FAILED) or gone — stop
        stopPolling();
        if (job && (job.status === "COMPLETED" || job.status === "PARTIAL")) {
          onImportComplete();
        }
      }
    };
    // First tick immediately
    void tick();
  }, [fetchActive, stopPolling, onImportComplete]);

  // On mount: check for any in-flight or recently-completed job for this
  // user. Picks up state after the user navigated away mid-upload.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const job = await fetchActive();
      if (cancelled || !isMountedRef.current) return;
      if (job && job.status === "PROCESSING") {
        setActiveJob(job);
        setIsUploading(true);
        startPolling();
      } else if (job && job.completedAt) {
        setActiveJob(job);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchActive, startPolling]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    setResult(null);
    setActiveJob(null);
    const f = e.target.files?.[0];
    if (f) setFile(f);
  };

  const handleUpload = useCallback(async () => {
    if (!file) return;
    setIsUploading(true);
    setError(null);
    setResult(null);
    setActiveJob(null);

    // Start polling immediately so the progress bar starts moving as soon
    // as the server creates the ImportJob row (usually within 1-2s).
    startPolling();

    try {
      const fd = new FormData();
      fd.append("file", file);

      const res = await fetch("/api/import/har-habituach/upload", {
        method: "POST",
        body: fd,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "שגיאה בייבוא");
      }

      const data = (await res.json()) as UploadSuccess;
      if (!isMountedRef.current) return;
      setResult(data);
      onImportComplete();
      stopPolling();
    } catch (err) {
      if (!isMountedRef.current) return;
      setError(err instanceof Error ? err.message : "שגיאה לא צפויה");
      stopPolling();
    } finally {
      if (isMountedRef.current) setIsUploading(false);
    }
  }, [file, startPolling, stopPolling, onImportComplete]);

  const handleReset = () => {
    setFile(null);
    setResult(null);
    setActiveJob(null);
    setError(null);
  };

  const showProgress = isUploading || activeJob?.status === "PROCESSING";
  const showResult = !showProgress && (result || activeJob?.completedAt);

  // Derive progress %
  let progressPercent = 0;
  let progressLabel = "מכין לייבוא...";
  if (activeJob) {
    const total = activeJob.totalRows ?? 0;
    const done = activeJob.importedRows ?? 0;
    if (total > 0) {
      progressPercent = Math.min(100, Math.round((done / total) * 100));
      progressLabel = `${done.toLocaleString("he-IL")} מתוך ${total.toLocaleString(
        "he-IL"
      )} לקוחות עובדו`;
    } else {
      progressLabel = "קורא את הקובץ...";
    }
  }

  return (
    <div className="space-y-4">
      {/* Explainer */}
      <Card className="border-primary-200 bg-primary-50/40" padding="sm">
        <div className="flex items-start gap-2.5">
          <FileSpreadsheet className="h-4 w-4 text-primary-600 mt-0.5 shrink-0" />
          <div className="text-sm text-surface-700 leading-relaxed space-y-1">
            <p className="font-medium">ייבוא פוטנציאלים מהר הביטוח</p>
            <p className="text-xs text-surface-600">
              המערכת תטען את קובץ ה-Excel, תתאים לקוחות לפי ת.ז., ותזהה
              פוליסות חדשות שהלקוח מחזיק מחוץ למשרד. לקוחות שלא קיימים עדיין
              במערכת ייווצרו עם סימון &quot;ללא תיק פעיל במשרד&quot;.
            </p>
          </div>
        </div>
      </Card>

      {/* Progress view */}
      {showProgress && (
        <Card padding="lg">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-surface-900">
                <Loader2 className="h-4 w-4 animate-spin text-primary-600" />
                מעבד את קובץ הר הביטוח
              </h3>
              <span className="text-xs text-surface-500 number">
                {progressPercent}%
              </span>
            </div>
            <ProgressBar value={progressPercent} variant="primary" />
            <p className="text-xs text-surface-600">{progressLabel}</p>
            {activeJob && activeJob.fileName && (
              <p className="text-[11px] text-surface-500 truncate">
                קובץ: {activeJob.fileName}
              </p>
            )}
            <p className="text-[11px] text-surface-400">
              אפשר להמשיך לעבוד במערכת — הייבוא ממשיך ברקע.
            </p>
          </div>
        </Card>
      )}

      {/* Upload form (hidden while processing or showing result) */}
      {!showProgress && !showResult && (
        <Card>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileChange}
                disabled={isUploading}
                className="block text-sm text-surface-700
                  file:me-3 file:rounded-lg file:border-0 file:bg-primary-600
                  file:px-4 file:py-2 file:text-sm file:font-medium
                  file:text-white hover:file:bg-primary-700
                  file:cursor-pointer disabled:opacity-50"
              />
              {file && (
                <span className="text-xs text-surface-600 number truncate">
                  {file.name} · {(file.size / 1024).toFixed(1)} KB
                </span>
              )}
            </div>

            <div className="flex items-center gap-3">
              <Button
                variant="primary"
                onClick={handleUpload}
                disabled={!file || isUploading}
              >
                <Upload className="h-4 w-4" />
                התחל ייבוא
              </Button>
              {error && (
                <p className="flex items-center gap-1 text-xs text-red-600">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {error}
                </p>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Result view — either from the POST response OR from the job
          we picked up on mount after a navigation */}
      {showResult && (
        <Card>
          <CardHeader>
            <CardTitle>
              <span className="flex items-center gap-2">
                <CheckCircle2
                  className={
                    activeJob?.status === "FAILED"
                      ? "h-4 w-4 text-red-600"
                      : "h-4 w-4 text-emerald-600"
                  }
                />
                {activeJob?.status === "FAILED"
                  ? "הייבוא נכשל"
                  : "הייבוא הושלם"}
              </span>
            </CardTitle>
            <Button variant="secondary" size="sm" onClick={handleReset}>
              ייבוא נוסף
            </Button>
          </CardHeader>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatBox
              label="שורות נקראו"
              value={result?.totalRows ?? activeJob?.totalRows ?? 0}
              sub={
                result && result.skippedRows > 0
                  ? `${result.skippedRows} דולגו`
                  : undefined
              }
            />
            <StatBox
              label="לקוחות מוכרים זוהו"
              value={
                result?.customersExisting ?? activeJob?.updatedCustomers ?? 0
              }
              sub="קיימים ב-DB"
            />
            <StatBox
              label="לקוחות חדשים נוצרו"
              value={
                result?.customersCreated ?? activeJob?.newCustomers ?? 0
              }
              sub={
                (result?.customersCreated ?? activeJob?.newCustomers ?? 0) > 0
                  ? "ללא תיק פעיל במשרד"
                  : undefined
              }
              tone={
                (result?.customersCreated ?? activeJob?.newCustomers ?? 0) > 0
                  ? "amber"
                  : undefined
              }
            />
            <StatBox
              label="פוליסות חיצוניות חדשות"
              value={result?.policiesCreated ?? 0}
              sub={
                result && result.policiesMatched > 0
                  ? `${result.policiesMatched} אומתו מול קיימות`
                  : undefined
              }
              tone="violet"
            />
          </div>

          {result && result.errorCount > 0 && (
            <p className="mt-4 text-xs text-amber-700">
              ⚠️ {result.errorCount} שגיאות בעיבוד — מופיעות ביומן הייבוא.
            </p>
          )}
        </Card>
      )}
    </div>
  );
}

function StatBox({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: number;
  sub?: string;
  tone?: "amber" | "violet";
}) {
  const toneClass =
    tone === "amber"
      ? "bg-amber-50/60 border-amber-200/60 text-amber-700"
      : tone === "violet"
        ? "bg-violet-50/60 border-violet-200/60 text-violet-700"
        : "bg-white/55 border-surface-200/70 text-surface-700";
  return (
    <div className={`rounded-xl border p-3 backdrop-blur-md ${toneClass}`}>
      <p className="text-[11px] font-medium">{label}</p>
      <p className="mt-1 text-2xl font-semibold number">
        {value.toLocaleString("he-IL")}
      </p>
      {sub && <p className="mt-0.5 text-[11px] opacity-80">{sub}</p>}
    </div>
  );
}
