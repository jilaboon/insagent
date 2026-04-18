"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Settings,
  Save,
  RotateCcw,
  Loader2,
  Info,
  Users,
  Clock,
  RefreshCw,
  Check,
  Layers,
  ArrowUp,
  ArrowDown,
  BookOpen,
} from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  useQueueSettings,
  useUpdateQueueSettings,
  useRebuildQueue,
  type QueueSettingsData,
} from "@/lib/api/hooks";

type Bucket = "coverage" | "savings" | "service" | "general";

const DEFAULTS: QueueSettingsData = {
  dailyCapacity: 20,
  urgentReserveSlots: 8,
  ageMilestones: [60],
  milestoneFreshnessDays: 30,
  milestoneRequiresPensionOrSavings: true,
  milestoneMinSavings: 50_000,
  highValueSavingsThreshold: 500_000,
  highValueMonthlyPremiumThreshold: 1_500,
  managementFeeThreshold: 1.5,
  costOptimizationMinSavings: 100_000,
  cooldownAfterDismissalDays: 60,
  recentContactSuppressionDays: 30,
  urgentCategories: ["AGE_MILESTONE"],
  bucketOrder: ["coverage", "savings", "service", "general"],
  renewalsLaneEnabled: true,
};

const BUCKET_META: Record<
  Bucket,
  { label: string; description: string; chip: string }
> = {
  coverage: {
    label: "כיסוי",
    description: "פערי כיסוי — חסר בריאות, חסר חיים, רכב חדש, נספח תרופות",
    chip: "bg-indigo-500/12 text-indigo-700 border-indigo-300/50",
  },
  savings: {
    label: "חיסכון",
    description: "דמי ניהול, חשיפה למניות, מסלולי חיסכון, פנסיה",
    chip: "bg-cyan-500/12 text-cyan-700 border-cyan-300/50",
  },
  service: {
    label: "שירות",
    description: "אבני דרך גיליות, תכנון פרישה, אין קשר לאחרונה",
    chip: "bg-violet-500/12 text-violet-700 border-violet-300/50",
  },
  general: {
    label: "כללי",
    description: "הרחבת סל, לקוח עם ענף אחד, הזדמנויות חוצות",
    chip: "bg-rose-500/12 text-rose-700 border-rose-300/50",
  },
};

function formatNumber(n: number): string {
  return n.toLocaleString("he-IL");
}

export default function QueueSettingsPage() {
  const { data, isLoading } = useQueueSettings();
  const update = useUpdateQueueSettings();
  const rebuild = useRebuildQueue();

  const [form, setForm] = useState<QueueSettingsData>(DEFAULTS);
  const [dirty, setDirty] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (data && !dirty) setForm(data);
  }, [data, dirty]);

  function patch(p: Partial<QueueSettingsData>) {
    setForm((prev) => ({ ...prev, ...p }));
    setDirty(true);
  }

  function moveBucket(bucket: Bucket, direction: -1 | 1) {
    const order = [...form.bucketOrder];
    const idx = order.indexOf(bucket);
    const newIdx = idx + direction;
    if (idx < 0 || newIdx < 0 || newIdx >= order.length) return;
    [order[idx], order[newIdx]] = [order[newIdx], order[idx]];
    patch({ bucketOrder: order });
  }

  async function handleSave() {
    const saved = await update.mutateAsync(form);
    setForm(saved);
    setDirty(false);
    setToast("השינויים נשמרו. לחץ על 'רענן תור' כדי לראות את השפעת השינויים");
    setTimeout(() => setToast(null), 6000);
  }

  function handleReset() {
    setForm(DEFAULTS);
    setDirty(true);
  }

  async function handleRebuildNow() {
    await rebuild.mutateAsync({ reason: "MANUAL_REFRESH" });
    setToast("התור נבנה מחדש בהצלחה");
    setTimeout(() => setToast(null), 4000);
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-surface-400">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="mr-2 text-sm">טוען הגדרות...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-surface-900 flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary-600" />
            הגדרות תור
          </h1>
          <p className="mt-1 text-sm text-surface-500">
            איך לבנות את התור — בשפה של המשרד, לא של המערכת
          </p>
        </div>
      </div>

      {/* Info banner */}
      <Card className="border-primary-200 bg-primary-50/40" padding="sm">
        <div className="flex items-start gap-2.5">
          <Info className="h-4 w-4 text-primary-600 mt-0.5 shrink-0" />
          <p className="text-sm text-surface-700 leading-relaxed">
            רוב ההחלטות של התור נשלטות בשתי הגדרות: <b>סדר הקטגוריות</b> ו
            <b>האם חידושים במסלול נפרד</b>. השאר כיוונון עדין.
          </p>
        </div>
      </Card>

      {/* === 1. Daily capacity === */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary-600" />
            קיבולת יומית
          </CardTitle>
        </CardHeader>
        <NumberField
          label="כמה לקוחות בתור של היום"
          helper="כמה משימות המשרד מטפל בהן ביום"
          value={form.dailyCapacity}
          defaultValue={DEFAULTS.dailyCapacity}
          min={1}
          max={100}
          onChange={(v) => patch({ dailyCapacity: v })}
          suffix="לקוחות"
        />
      </Card>

      {/* === 2. Bucket order — the key lever === */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-primary-600" />
            סדר הקטגוריות
          </CardTitle>
        </CardHeader>

        <div className="space-y-3">
          <p className="text-sm text-surface-600 leading-relaxed">
            הקטגוריה בראש הרשימה שולטת בתור. הזיזו למעלה כדי להדגיש קטגוריה
            השבוע, למטה כדי לדחות. לקוחות שאין להם תובנות בקטגוריה הדומיננטית
            יעלו בקטגוריה הבאה ברשימה.
          </p>

          <ol className="space-y-2">
            {form.bucketOrder.map((b, idx) => {
              const meta = BUCKET_META[b];
              const isFirst = idx === 0;
              const isLast = idx === form.bucketOrder.length - 1;
              return (
                <li
                  key={b}
                  className="flex items-center gap-3 rounded-xl border border-white/70 bg-white/65 p-3 backdrop-blur-md transition-shadow hover:shadow-sm"
                >
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => moveBucket(b, -1)}
                      disabled={isFirst}
                      aria-label="העבר למעלה"
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/60 bg-white/60 text-surface-600 transition-colors hover:bg-white/85 hover:text-violet-700 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveBucket(b, 1)}
                      disabled={isLast}
                      aria-label="העבר למטה"
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/60 bg-white/60 text-surface-600 transition-colors hover:bg-white/85 hover:text-violet-700 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="flex w-7 shrink-0 justify-center">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-surface-100 text-xs font-semibold text-surface-700 number">
                      {idx + 1}
                    </span>
                  </div>

                  <span
                    className={cn(
                      "inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium backdrop-blur-md",
                      meta.chip
                    )}
                  >
                    {meta.label}
                  </span>

                  <p className="flex-1 text-sm text-surface-700">
                    {meta.description}
                  </p>
                </li>
              );
            })}
          </ol>
        </div>
      </Card>

      {/* === 3. Renewals lane === */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-primary-600" />
            חידושים
          </CardTitle>
        </CardHeader>

        <ToggleField
          label="חידושים במסלול נפרד (חידושים מ-BAFI)"
          helper={
            form.renewalsLaneEnabled
              ? "חידושים לא מתחרים בתור הראשי. הם מופיעים בעמוד 'חידושים מ-BAFI'."
              : "חידושים מופיעים בתור הראשי יחד עם שאר התובנות."
          }
          checked={form.renewalsLaneEnabled}
          onChange={(v) => patch({ renewalsLaneEnabled: v })}
        />
      </Card>

      {/* === 4. When a customer returns to the queue === */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary-600" />
            מתי לקוח חוזר לתור
          </CardTitle>
        </CardHeader>

        <div className="space-y-5">
          <NumberField
            label="אחרי פנייה, כמה ימים עד שהלקוח יחזור"
            helper="מונע הטרדה — אחרי הודעה שנשלחה ללקוח, לא נציג אותו מיד"
            value={form.recentContactSuppressionDays}
            defaultValue={DEFAULTS.recentContactSuppressionDays}
            min={0}
            max={365}
            onChange={(v) => patch({ recentContactSuppressionDays: v })}
            suffix="ימים"
          />
          <NumberField
            label="אחרי 'לא רלוונטי', כמה ימים עד שהלקוח יחזור"
            helper="סימון לקוח כלא רלוונטי מרחיק אותו מהתור לתקופה הזאת"
            value={form.cooldownAfterDismissalDays}
            defaultValue={DEFAULTS.cooldownAfterDismissalDays}
            min={0}
            max={365}
            onChange={(v) => patch({ cooldownAfterDismissalDays: v })}
            suffix="ימים"
          />
        </div>
      </Card>

      {/* Rules link — replaces the old "advanced" drawer */}
      <Card padding="sm" className="border-primary-200 bg-primary-50/40">
        <div className="flex items-start gap-3">
          <BookOpen className="h-4 w-4 text-primary-600 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-surface-800">
              כיוונון של כלל ספציפי
            </p>
            <p className="mt-0.5 text-xs text-surface-600 leading-relaxed">
              הגדרות הקשורות לכלל אחד (למשל אבני דרך גיליות, דמי ניהול,
              חשיפה למניות) יעברו לעמוד הכללים. שם כל כלל יכלול את
              הפרמטרים שלו.
            </p>
            <Link
              href="/rules"
              className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-violet-700 hover:text-violet-800"
            >
              עבור לעמוד הכללים ←
            </Link>
          </div>
        </div>
      </Card>

      {/* Sticky footer */}
      <div className="fixed bottom-0 left-0 right-64 border-t border-surface-200 bg-white/95 backdrop-blur px-6 py-3 z-20">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {toast && (
              <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-1.5 text-xs text-emerald-700">
                <Check className="h-3.5 w-3.5" />
                <span>{toast}</span>
                {toast.includes("רענן") && (
                  <button
                    type="button"
                    onClick={handleRebuildNow}
                    disabled={rebuild.isPending}
                    className="mr-2 font-semibold underline hover:text-emerald-900 disabled:opacity-50"
                  >
                    {rebuild.isPending ? "בונה..." : "רענן תור עכשיו"}
                  </button>
                )}
              </div>
            )}
            {dirty && !toast && (
              <span className="text-xs text-amber-700">
                יש שינויים שלא נשמרו
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={handleReset} disabled={update.isPending}>
              <RotateCcw className="h-4 w-4" />
              החזר לברירות מחדל
            </Button>
            <Button
              variant="secondary"
              onClick={handleRebuildNow}
              disabled={rebuild.isPending || dirty}
              title={dirty ? "יש לשמור את השינויים קודם" : undefined}
            >
              {rebuild.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              רענן תור
            </Button>
            <Button
              variant="primary"
              onClick={handleSave}
              disabled={!dirty || update.isPending}
            >
              {update.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              שמור שינויים
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Sub-components
// ============================================================

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-sm font-medium text-surface-800">
      {children}
    </label>
  );
}

function Helper({ children }: { children: React.ReactNode }) {
  return <p className="mt-1.5 text-xs text-surface-500">{children}</p>;
}

interface NumberFieldProps {
  label: string;
  helper?: string;
  value: number;
  defaultValue: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
  suffix?: string;
  currency?: boolean;
  decimals?: number;
}

function NumberField({
  label,
  helper,
  value,
  defaultValue,
  min,
  max,
  step,
  onChange,
  suffix,
  currency,
  decimals,
}: NumberFieldProps) {
  const showDefault = value !== defaultValue;
  const defaultLabel = currency
    ? `₪${formatNumber(defaultValue)}`
    : decimals != null
      ? `${defaultValue.toFixed(decimals)}${suffix ?? ""}`
      : `${formatNumber(defaultValue)}${suffix ? ` ${suffix}` : ""}`;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <Label>{label}</Label>
        {showDefault && (
          <span className="text-[11px] text-surface-400" title="ברירת המחדל המקורית">
            ברירת מחדל: {defaultLabel}
          </span>
        )}
      </div>
      <div className="mt-2 flex items-stretch gap-2">
        {currency && (
          <span className="inline-flex items-center rounded-lg border border-surface-200 bg-surface-50 px-3 text-sm font-medium text-surface-500">
            ₪
          </span>
        )}
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (!Number.isFinite(n)) return;
            let clamped = n;
            if (min != null && clamped < min) clamped = min;
            if (max != null && clamped > max) clamped = max;
            onChange(clamped);
          }}
          className="number flex-1 rounded-lg border border-white/80 bg-white/80 px-3 py-2 text-sm text-surface-900 text-right backdrop-blur-sm focus:border-violet-400/60 focus:bg-white/90 focus:outline-none focus:ring-2 focus:ring-violet-400/25"
        />
        {suffix && !currency && (
          <span className="inline-flex items-center rounded-lg border border-surface-200 bg-surface-50 px-3 text-sm font-medium text-surface-500">
            {suffix}
          </span>
        )}
      </div>
      {currency && (
        <p className="mt-1 text-[11px] text-surface-400 number">
          ≈ ₪{formatNumber(value)}
        </p>
      )}
      {helper && <Helper>{helper}</Helper>}
    </div>
  );
}

interface ToggleFieldProps {
  label: string;
  helper?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}

function ToggleField({ label, helper, checked, onChange }: ToggleFieldProps) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <Label>{label}</Label>
        {helper && <Helper>{helper}</Helper>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors mt-0.5 ${
          checked ? "bg-primary-600" : "bg-surface-300"
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
            checked ? "-translate-x-4" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}
