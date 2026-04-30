"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Upload,
  FileCode,
  CheckCircle2,
  Loader2,
  AlertCircle,
  ShieldCheck,
  X,
  Search,
  UserCheck,
  UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";

// ============================================================
// Shared types — kept in sync with the route + pipeline contract.
// ============================================================

type ConsentSource =
  | "CUSTOMER_VERBAL"
  | "CUSTOMER_SIGNED"
  | "AGENT_REPRESENTED"
  | "DEMO_INTERNAL";

type ConsentScope = "MISLEKA_PRODUCTS" | "FULL_360" | "DEMO_INTERNAL";

type MatchConfidence = "HIGH" | "MEDIUM" | "LOW" | "NONE";

interface ImportReportFile {
  fileName: string;
  providerCode: string;
  providerName: string;
  productCount: number;
  warningCount: number;
}

interface ImportReportManualReview {
  fileName: string;
  candidateCustomerId: string;
  candidateCustomerName: string;
  confidence: MatchConfidence;
  reason: string;
}

interface ImportReportWarning {
  code: string;
  message: string;
  fileName?: string;
  productPath?: string;
  path?: string;
}

interface ImportReport {
  importJobId: string;
  fileCount: number;
  filesProcessed: ImportReportFile[];
  matchedCustomers: number;
  newCustomers: number;
  manualReviewQueue: ImportReportManualReview[];
  productsCreated: number;
  productsUpdated: number;
  balanceSnapshotsCreated: number;
  warnings: ImportReportWarning[];
  errors: ImportReportWarning[];
  durationMs: number;
}

interface CustomerSearchResult {
  id: string;
  firstName: string | null;
  lastName: string | null;
  israeliId: string | null;
}

// ============================================================
// Static option lists — Hebrew labels paired with English codes.
// ============================================================

const CONSENT_SOURCE_OPTIONS: Array<{
  value: ConsentSource;
  label: string;
  hint: string;
}> = [
  {
    value: "CUSTOMER_VERBAL",
    label: "אישור בעל-פה מהלקוח",
    hint: "תועד בשיחה עם הלקוח",
  },
  {
    value: "CUSTOMER_SIGNED",
    label: "טופס חתום מהלקוח",
    hint: "מסמך הסכמה חתום",
  },
  {
    value: "AGENT_REPRESENTED",
    label: "ייצוג סוכן מורשה",
    hint: "ייפוי כוח קיים",
  },
  {
    value: "DEMO_INTERNAL",
    label: "נתוני דמו פנימיים",
    hint: "OWNER בלבד — דורש אישור עוקף",
  },
];

const CONSENT_SCOPE_OPTIONS: Array<{
  value: ConsentScope;
  label: string;
}> = [
  { value: "MISLEKA_PRODUCTS", label: "מוצרי מסלקה בלבד" },
  { value: "FULL_360", label: "תמונת 360 מלאה" },
  { value: "DEMO_INTERNAL", label: "דמו פנימי" },
];

// ============================================================
// Component
// ============================================================

type Stage = "upload" | "uploading" | "summary";

export function MislekaImport({
  onImportComplete,
}: {
  onImportComplete: () => void;
}) {
  // Stage / lifecycle
  const [stage, setStage] = useState<Stage>("upload");
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);

  // Files
  const [files, setFiles] = useState<File[]>([]);

  // Consent capture
  const [consentSource, setConsentSource] = useState<ConsentSource>(
    "CUSTOMER_VERBAL"
  );
  const [consentScope, setConsentScope] =
    useState<ConsentScope>("MISLEKA_PRODUCTS");
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [consentDate, setConsentDate] = useState<string>(today);
  const [consentDocRef, setConsentDocRef] = useState<string>("");
  const [bypassConsent, setBypassConsent] = useState<boolean>(false);

  // Customer selector
  const [customerQuery, setCustomerQuery] = useState<string>("");
  const [customerResults, setCustomerResults] = useState<CustomerSearchResult[]>(
    []
  );
  const [selectedCustomer, setSelectedCustomer] =
    useState<CustomerSearchResult | null>(null);
  const [showCustomerResults, setShowCustomerResults] = useState<boolean>(false);
  const searchTimerRef = useRef<NodeJS.Timeout | null>(null);

  const isMountedRef = useRef(true);
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  // Auto-untick bypass when scope changes away from DEMO_INTERNAL — the
  // route enforces the same rule, but giving the operator immediate
  // feedback in the UI makes the constraint readable instead of a 400.
  useEffect(() => {
    if (consentScope !== "DEMO_INTERNAL" && bypassConsent) {
      setBypassConsent(false);
    }
  }, [consentScope, bypassConsent]);

  // ---- File handlers ----------------------------------------------------
  const handleFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const list = e.target.files;
    if (!list || list.length === 0) return;
    const xmlOnly = Array.from(list).filter((f) =>
      f.name.toLowerCase().endsWith(".xml")
    );
    setFiles((prev) => {
      // De-dup by name+size
      const seen = new Set(prev.map((f) => `${f.name}|${f.size}`));
      const merged = [...prev];
      for (const f of xmlOnly) {
        const key = `${f.name}|${f.size}`;
        if (!seen.has(key)) {
          merged.push(f);
          seen.add(key);
        }
      }
      return merged.slice(0, 20);
    });
    // Reset the input so re-picking the same file fires onChange
    e.target.value = "";
  };

  const removeFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  // ---- Customer search -------------------------------------------------
  const runCustomerSearch = useCallback(async (query: string) => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setCustomerResults([]);
      return;
    }
    try {
      const params = new URLSearchParams({
        search: trimmed,
        limit: "8",
      });
      const res = await fetch(`/api/customers?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const body = (await res.json()) as { items: CustomerSearchResult[] };
      if (!isMountedRef.current) return;
      setCustomerResults(body.items.slice(0, 8));
    } catch {
      // Silent — autocomplete failures shouldn't block the form.
    }
  }, []);

  const handleCustomerQueryChange = (value: string) => {
    setCustomerQuery(value);
    setShowCustomerResults(true);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      void runCustomerSearch(value);
    }, 250);
  };

  const pickCustomer = (c: CustomerSearchResult) => {
    setSelectedCustomer(c);
    setShowCustomerResults(false);
    setCustomerQuery("");
  };

  const clearSelectedCustomer = () => {
    setSelectedCustomer(null);
    setCustomerQuery("");
  };

  // ---- Submit -----------------------------------------------------------
  const totalSize = files.reduce((acc, f) => acc + f.size, 0);

  const canSubmit =
    files.length > 0 &&
    files.length <= 20 &&
    consentDate.length > 0 &&
    (consentScope !== "DEMO_INTERNAL" || bypassConsent);

  const handleUpload = useCallback(async () => {
    if (!canSubmit) return;
    setStage("uploading");
    setError(null);
    setReport(null);

    try {
      const fd = new FormData();
      for (const f of files) {
        fd.append("file", f);
      }
      if (selectedCustomer) {
        fd.append("customerId", selectedCustomer.id);
      }
      fd.append("consentSource", consentSource);
      fd.append("consentScope", consentScope);
      // The route expects ISO datetime, not just a date.
      const isoDate = new Date(`${consentDate}T00:00:00Z`).toISOString();
      fd.append("consentDate", isoDate);
      if (consentDocRef.trim().length > 0) {
        fd.append("consentDocRef", consentDocRef.trim());
      }
      if (bypassConsent) {
        fd.append("bypassConsent", "true");
      }

      const res = await fetch("/api/import/misleka/upload", {
        method: "POST",
        body: fd,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "שגיאה בייבוא קובצי המסלקה");
      }

      const data = (await res.json()) as ImportReport;
      if (!isMountedRef.current) return;
      setReport(data);
      setStage("summary");
      onImportComplete();
    } catch (err) {
      if (!isMountedRef.current) return;
      setError(err instanceof Error ? err.message : "שגיאה לא צפויה");
      setStage("upload");
    }
  }, [
    canSubmit,
    files,
    selectedCustomer,
    consentSource,
    consentScope,
    consentDate,
    consentDocRef,
    bypassConsent,
    onImportComplete,
  ]);

  const handleReset = () => {
    setFiles([]);
    setReport(null);
    setError(null);
    setStage("upload");
    setSelectedCustomer(null);
    setCustomerQuery("");
    setConsentDocRef("");
  };

  // =====================================================================
  // Render
  // =====================================================================

  return (
    <div className="space-y-4">
      {/* Explainer card */}
      <Card className="border-indigo-200 bg-indigo-50/40" padding="sm">
        <div className="flex items-start gap-2.5">
          <FileCode className="h-4 w-4 text-indigo-600 mt-0.5 shrink-0" />
          <div className="text-sm text-surface-700 leading-relaxed space-y-1">
            <p className="font-medium">ייבוא קבצי מסלקה (מבנה אחיד)</p>
            <p className="text-xs text-surface-600">
              קבצים XML של פנסיה, גמל, השתלמות וביטוחי חיים מהגופים המוסדיים.
              ייבוא הקבצים דורש אישור הסכמה מהלקוח.
            </p>
          </div>
        </div>
      </Card>

      {stage === "uploading" && <UploadingView fileCount={files.length} />}

      {stage === "upload" && (
        <UploadForm
          files={files}
          onFilesChange={handleFilesChange}
          onRemoveFile={removeFile}
          totalSize={totalSize}
          consentSource={consentSource}
          onConsentSourceChange={setConsentSource}
          consentScope={consentScope}
          onConsentScopeChange={setConsentScope}
          consentDate={consentDate}
          onConsentDateChange={setConsentDate}
          consentDocRef={consentDocRef}
          onConsentDocRefChange={setConsentDocRef}
          bypassConsent={bypassConsent}
          onBypassConsentChange={setBypassConsent}
          customerQuery={customerQuery}
          customerResults={customerResults}
          showCustomerResults={showCustomerResults}
          selectedCustomer={selectedCustomer}
          onCustomerQueryChange={handleCustomerQueryChange}
          onPickCustomer={pickCustomer}
          onClearCustomer={clearSelectedCustomer}
          onSubmit={handleUpload}
          canSubmit={canSubmit}
          error={error}
          today={today}
        />
      )}

      {stage === "summary" && report && (
        <SummaryView report={report} onReset={handleReset} />
      )}
    </div>
  );
}

// ============================================================
// Upload form — broken out for readability. Pure presentation.
// ============================================================

interface UploadFormProps {
  files: File[];
  onFilesChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveFile: (idx: number) => void;
  totalSize: number;
  consentSource: ConsentSource;
  onConsentSourceChange: (v: ConsentSource) => void;
  consentScope: ConsentScope;
  onConsentScopeChange: (v: ConsentScope) => void;
  consentDate: string;
  onConsentDateChange: (v: string) => void;
  consentDocRef: string;
  onConsentDocRefChange: (v: string) => void;
  bypassConsent: boolean;
  onBypassConsentChange: (v: boolean) => void;
  customerQuery: string;
  customerResults: CustomerSearchResult[];
  showCustomerResults: boolean;
  selectedCustomer: CustomerSearchResult | null;
  onCustomerQueryChange: (v: string) => void;
  onPickCustomer: (c: CustomerSearchResult) => void;
  onClearCustomer: () => void;
  onSubmit: () => void;
  canSubmit: boolean;
  error: string | null;
  today: string;
}

function UploadForm(props: UploadFormProps) {
  return (
    <div className="space-y-4">
      {/* Files */}
      <Card padding="md">
        <CardHeader>
          <CardTitle>קבצי XML של מסלקה</CardTitle>
          <span className="text-[11px] text-surface-500">
            עד 20 קבצים · עד 25MB לקובץ
          </span>
        </CardHeader>

        <div className="space-y-3">
          <input
            type="file"
            accept=".xml,application/xml,text/xml"
            multiple
            onChange={props.onFilesChange}
            className="block text-sm text-surface-700
              file:me-3 file:rounded-lg file:border-0 file:bg-primary-600
              file:px-4 file:py-2 file:text-sm file:font-medium
              file:text-white hover:file:bg-primary-700
              file:cursor-pointer"
          />

          {props.files.length > 0 && (
            <ul className="space-y-1.5">
              {props.files.map((f, idx) => (
                <li
                  key={`${f.name}-${idx}`}
                  className="flex items-center justify-between rounded-lg border border-white/70 bg-white/50 px-3 py-2 text-xs"
                >
                  <span className="flex items-center gap-2 truncate">
                    <FileCode className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
                    <span className="truncate text-surface-800">{f.name}</span>
                    <span className="text-surface-500 number">
                      {(f.size / 1024).toFixed(1)} KB
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => props.onRemoveFile(idx)}
                    className="ms-2 rounded p-1 text-surface-500 hover:bg-rose-50 hover:text-rose-600"
                    aria-label="הסר קובץ"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {props.files.length > 0 && (
            <p className="text-[11px] text-surface-500 number">
              סה״כ {props.files.length} קבצים · {(props.totalSize / 1024).toFixed(1)} KB
            </p>
          )}
        </div>
      </Card>

      {/* Customer linkage (optional) */}
      <Card padding="md">
        <CardHeader>
          <CardTitle>שיוך ללקוח (אופציונלי)</CardTitle>
          <span className="text-[11px] text-surface-500">
            ניתן להשאיר ריק — המערכת תתאים לפי ת.ז.
          </span>
        </CardHeader>

        <div className="space-y-2">
          {props.selectedCustomer ? (
            <div className="flex items-center justify-between rounded-lg border border-violet-200 bg-violet-50/50 px-3 py-2">
              <div className="flex items-center gap-2 text-sm">
                <UserCheck className="h-4 w-4 text-violet-600" />
                <span className="font-medium text-violet-800">
                  {props.selectedCustomer.firstName ?? ""}{" "}
                  {props.selectedCustomer.lastName ?? ""}
                </span>
                {props.selectedCustomer.israeliId && (
                  <span className="text-xs text-surface-500 number">
                    ת.ז. {props.selectedCustomer.israeliId}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={props.onClearCustomer}
                className="rounded p-1 text-surface-500 hover:bg-white/70"
                aria-label="הסר שיוך"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <div className="relative">
              <Search className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 h-4 w-4 text-surface-400" />
              <input
                type="text"
                value={props.customerQuery}
                onChange={(e) => props.onCustomerQueryChange(e.target.value)}
                placeholder="חפשו לפי שם או ת.ז."
                className="w-full rounded-lg border border-white/70 bg-white/60 px-3 py-2 pe-10 text-sm placeholder:text-surface-400 focus:border-violet-300 focus:outline-none focus:ring-2 focus:ring-violet-300/40"
              />
              {props.showCustomerResults &&
                props.customerResults.length > 0 && (
                  <ul className="absolute inset-x-0 top-full z-10 mt-1 max-h-64 overflow-y-auto rounded-lg border border-white/70 bg-white/95 backdrop-blur-md shadow-lg">
                    {props.customerResults.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => props.onPickCustomer(c)}
                          className="flex w-full items-center justify-between px-3 py-2 text-right text-sm hover:bg-violet-50"
                        >
                          <span className="text-surface-800">
                            {c.firstName ?? ""} {c.lastName ?? ""}
                          </span>
                          {c.israeliId && (
                            <span className="text-xs text-surface-500 number">
                              {c.israeliId}
                            </span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
            </div>
          )}
        </div>
      </Card>

      {/* Consent */}
      <Card padding="md">
        <CardHeader>
          <CardTitle>
            <span className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-indigo-600" />
              אישור הסכמה
            </span>
          </CardTitle>
        </CardHeader>

        <div className="space-y-4">
          {/* Source — radio */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-surface-700">
              מקור ההסכמה
            </label>
            <div className="grid gap-2 sm:grid-cols-2">
              {CONSENT_SOURCE_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-xs transition ${
                    props.consentSource === opt.value
                      ? "border-violet-300 bg-violet-50/60"
                      : "border-white/70 bg-white/45 hover:bg-white/65"
                  }`}
                >
                  <input
                    type="radio"
                    name="consentSource"
                    value={opt.value}
                    checked={props.consentSource === opt.value}
                    onChange={() => props.onConsentSourceChange(opt.value)}
                    className="mt-0.5 accent-violet-600"
                  />
                  <span>
                    <span className="block font-medium text-surface-800">
                      {opt.label}
                    </span>
                    <span className="block text-[11px] text-surface-500">
                      {opt.hint}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Scope — select */}
          <div className="space-y-2">
            <label
              htmlFor="consent-scope"
              className="text-xs font-medium text-surface-700"
            >
              היקף ההסכמה
            </label>
            <select
              id="consent-scope"
              value={props.consentScope}
              onChange={(e) =>
                props.onConsentScopeChange(e.target.value as ConsentScope)
              }
              className="w-full rounded-lg border border-white/70 bg-white/60 px-3 py-2 text-sm focus:border-violet-300 focus:outline-none focus:ring-2 focus:ring-violet-300/40"
            >
              {CONSENT_SCOPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Date + doc ref — side by side on wider screens */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <label
                htmlFor="consent-date"
                className="text-xs font-medium text-surface-700"
              >
                תאריך ההסכמה
              </label>
              <input
                id="consent-date"
                type="date"
                value={props.consentDate}
                max={props.today}
                onChange={(e) => props.onConsentDateChange(e.target.value)}
                className="w-full rounded-lg border border-white/70 bg-white/60 px-3 py-2 text-sm focus:border-violet-300 focus:outline-none focus:ring-2 focus:ring-violet-300/40"
              />
            </div>
            <div className="space-y-2">
              <label
                htmlFor="consent-docref"
                className="text-xs font-medium text-surface-700"
              >
                קישור למסמך הסכמה (אופציונלי)
              </label>
              <input
                id="consent-docref"
                type="url"
                inputMode="url"
                placeholder="https://"
                value={props.consentDocRef}
                onChange={(e) => props.onConsentDocRefChange(e.target.value)}
                className="w-full rounded-lg border border-white/70 bg-white/60 px-3 py-2 text-sm placeholder:text-surface-400 focus:border-violet-300 focus:outline-none focus:ring-2 focus:ring-violet-300/40"
              />
            </div>
          </div>

          {/* Demo bypass — OWNER only, only meaningful with DEMO_INTERNAL */}
          {props.consentScope === "DEMO_INTERNAL" && (
            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 text-xs">
              <input
                type="checkbox"
                checked={props.bypassConsent}
                onChange={(e) => props.onBypassConsentChange(e.target.checked)}
                className="mt-0.5 accent-amber-600"
              />
              <span>
                <span className="block font-medium text-amber-800">
                  אישור עוקף לדמו פנימי
                </span>
                <span className="block text-[11px] text-amber-700">
                  שמור ל-OWNER · ייכתב לאודיט בנפרד
                </span>
              </span>
            </label>
          )}
        </div>
      </Card>

      {/* Submit + error */}
      <Card padding="md">
        <div className="flex items-center justify-between gap-3">
          <Button
            variant="primary"
            onClick={props.onSubmit}
            disabled={!props.canSubmit}
          >
            <Upload className="h-4 w-4" />
            התחל ייבוא
          </Button>
          {props.error && (
            <p className="flex items-center gap-1 text-xs text-rose-700">
              <AlertCircle className="h-3.5 w-3.5" />
              {props.error}
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}

// ============================================================
// In-flight view
// ============================================================

function UploadingView({ fileCount }: { fileCount: number }) {
  return (
    <Card padding="lg">
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
        <p className="mt-3 text-sm font-medium text-surface-900">
          מעבד את קבצי המסלקה
        </p>
        <p className="mt-1 text-xs text-surface-600 number">
          {fileCount} קבצים · אנא המתינו
        </p>
        <p className="mt-3 text-[11px] text-surface-400">
          ניתן להמשיך לעבוד במערכת — הייבוא ממשיך ברקע.
        </p>
      </div>
    </Card>
  );
}

// ============================================================
// Summary view
// ============================================================

function SummaryView({
  report,
  onReset,
}: {
  report: ImportReport;
  onReset: () => void;
}) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>
            <span className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              ייבוא המסלקה הושלם
            </span>
          </CardTitle>
          <Button variant="secondary" size="sm" onClick={onReset}>
            ייבוא נוסף
          </Button>
        </CardHeader>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatBox label="קבצים נטענו" value={report.fileCount} />
          <StatBox
            label="לקוחות מוכרים"
            value={report.matchedCustomers}
            sub="זוהו במאגר"
          />
          <StatBox
            label="לקוחות חדשים"
            value={report.newCustomers}
            sub={
              report.newCustomers > 0
                ? "ללא תיק פעיל במשרד"
                : undefined
            }
            tone={report.newCustomers > 0 ? "amber" : undefined}
          />
          <StatBox
            label="מוצרים מוסדיים"
            value={report.productsCreated + report.productsUpdated}
            sub={
              report.productsUpdated > 0
                ? `${report.productsUpdated} עודכנו`
                : undefined
            }
            tone="indigo"
          />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatBox
            label="צילומי יתרה"
            value={report.balanceSnapshotsCreated}
          />
          <StatBox
            label="התראות"
            value={report.warnings.length}
            tone={report.warnings.length > 0 ? "amber" : undefined}
          />
          <StatBox
            label="שגיאות"
            value={report.errors.length}
            tone={report.errors.length > 0 ? "rose" : undefined}
          />
        </div>
      </Card>

      {/* Per-file detail */}
      {report.filesProcessed.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>פירוט לפי קובץ</CardTitle>
          </CardHeader>
          <ul className="space-y-2">
            {report.filesProcessed.map((f, idx) => (
              <li
                key={`${f.fileName}-${idx}`}
                className="flex items-center justify-between rounded-lg border border-white/70 bg-white/45 px-3 py-2 text-xs"
              >
                <div className="flex items-center gap-2 truncate">
                  <FileCode className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
                  <span className="truncate text-surface-800">
                    {f.fileName}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-surface-600">
                  {f.providerName && (
                    <Badge variant="info">{f.providerName}</Badge>
                  )}
                  <span className="number">{f.productCount} מוצרים</span>
                  {f.warningCount > 0 && (
                    <Badge variant="warning">
                      <span className="number">{f.warningCount}</span> התראות
                    </Badge>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Manual review queue */}
      {report.manualReviewQueue.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>
              <span className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-amber-600" />
                התאמות לבדיקה ידנית
              </span>
            </CardTitle>
            <span className="text-[11px] text-surface-500 number">
              {report.manualReviewQueue.length} פריטים
            </span>
          </CardHeader>

          <ul className="space-y-3">
            {report.manualReviewQueue.map((item, idx) => (
              <ManualReviewCard key={idx} item={item} />
            ))}
          </ul>
        </Card>
      )}

      {/* Warnings — capped at 25 to keep the card scannable */}
      {report.warnings.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>התראות עיבוד</CardTitle>
          </CardHeader>
          <ul className="space-y-1.5 text-xs text-amber-800">
            {report.warnings.slice(0, 25).map((w, idx) => (
              <li
                key={idx}
                className="rounded-md border border-amber-200/70 bg-amber-50/40 px-2.5 py-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate">{w.message}</span>
                  <span className="text-[10px] text-amber-700/70 number">
                    {w.code}
                  </span>
                </div>
                {w.fileName && (
                  <span className="mt-0.5 block text-[10px] text-amber-700/60">
                    {w.fileName}
                  </span>
                )}
              </li>
            ))}
            {report.warnings.length > 25 && (
              <li className="text-[11px] text-amber-700/70">
                + {report.warnings.length - 25} התראות נוספות ביומן הייבוא
              </li>
            )}
          </ul>
        </Card>
      )}

      {/* Empty-state hint when nothing notable came back */}
      {report.filesProcessed.length === 0 && (
        <EmptyState
          icon={FileCode}
          title="לא עובדו קבצים"
          description="לא נמצא תוכן תקין לעיבוד בקבצים שהועלו."
        />
      )}
    </div>
  );
}

// ============================================================
// Manual-review card — actions disabled in this phase per spec.
// ============================================================

function ManualReviewCard({ item }: { item: ImportReportManualReview }) {
  const confidenceVariant =
    item.confidence === "HIGH"
      ? "success"
      : item.confidence === "MEDIUM"
        ? "info"
        : "warning";
  return (
    <li className="rounded-xl border border-amber-200/70 bg-amber-50/40 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-surface-900 truncate">
            {item.candidateCustomerName}
          </p>
          <p className="mt-0.5 text-[11px] text-surface-500 truncate">
            {item.fileName}
          </p>
          <p className="mt-1 text-xs text-surface-700">{item.reason}</p>
        </div>
        <Badge variant={confidenceVariant}>{item.confidence}</Badge>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled
          title="יבוצע בשלב הבא"
        >
          <UserCheck className="h-3.5 w-3.5" />
          אשר התאמה
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled
          title="יבוצע בשלב הבא"
        >
          <UserPlus className="h-3.5 w-3.5" />
          צור לקוח חדש
        </Button>
        <span className="text-[11px] text-surface-500">
          הפעולות יתאפשרו בשלב הבא
        </span>
      </div>
    </li>
  );
}

// ============================================================
// Stat box (mirrors HarHabituachImport's stat treatment)
// ============================================================

function StatBox({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: number;
  sub?: string;
  tone?: "amber" | "violet" | "indigo" | "rose";
}) {
  const toneClass =
    tone === "amber"
      ? "bg-amber-50/60 border-amber-200/60 text-amber-700"
      : tone === "violet"
        ? "bg-violet-50/60 border-violet-200/60 text-violet-700"
        : tone === "indigo"
          ? "bg-indigo-50/60 border-indigo-200/60 text-indigo-700"
          : tone === "rose"
            ? "bg-rose-50/60 border-rose-200/60 text-rose-700"
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
