"use client";

import { useEffect, useState } from "react";
import {
  Settings,
  Save,
  RotateCcw,
  Loader2,
  Info,
  Users,
  Cake,
  Gem,
  Percent,
  ShieldOff,
  RefreshCw,
  Check,
  AlertCircle,
} from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  useQueueSettings,
  useUpdateQueueSettings,
  useRebuildQueue,
  type QueueSettingsData,
} from "@/lib/api/hooks";

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
};

const MILESTONE_AGE_OPTIONS = [55, 60, 65, 67];
const FRESHNESS_OPTIONS = [30, 60, 90];

const URGENT_CATEGORY_OPTIONS: Array<{ value: string; label: string; description: string }> = [
  { value: "AGE_MILESTONE", label: "אבן דרך גילית", description: "הלקוח הגיע לגיל משמעותי (60, 65, וכו')" },
  { value: "HIGH_VALUE", label: "לקוח משמעותי", description: "חיסכון גבוה או פרמיה גבוהה" },
  { value: "COST_OPTIMIZATION", label: "אופטימיזציית עלות", description: "דמי ניהול חריגים" },
  { value: "COVERAGE_GAP", label: "פער כיסוי", description: "חסר ביטוח חיים או בריאות" },
  { value: "URGENT_EXPIRY", label: "פוליסה מתחדשת", description: "BAFI כבר מטפל בזה — בדרך כלל לא מומלץ" },
  { value: "SERVICE", label: "שירות", description: "לא היה קשר תקופה ארוכה" },
  { value: "CROSS_SELL", label: "הרחבת סל", description: "לקוח עם ענף אחד בלבד" },
];

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

  // Sync form when the server data arrives (but don't overwrite local edits).
  useEffect(() => {
    if (data && !dirty) {
      setForm(data);
    }
  }, [data, dirty]);

  function patch(p: Partial<QueueSettingsData>) {
    setForm((prev) => ({ ...prev, ...p }));
    setDirty(true);
  }

  function toggleMilestone(age: number) {
    const set = new Set(form.ageMilestones);
    if (set.has(age)) set.delete(age);
    else set.add(age);
    patch({ ageMilestones: Array.from(set).sort((a, b) => a - b) });
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
            כיוונון האלגוריתם שבונה את המשימות היומיות
          </p>
        </div>
      </div>

      {/* Info banner */}
      <Card className="border-primary-200 bg-primary-50/40" padding="sm">
        <div className="flex items-start gap-2.5">
          <Info className="h-4 w-4 text-primary-600 mt-0.5 shrink-0" />
          <p className="text-sm text-surface-700 leading-relaxed">
            הגדרות אלו קובעות איך התור בונה את המשימות של היום. שינויים ייכנסו
            לתוקף בבניית התור הבאה.
          </p>
        </div>
      </Card>

      {/* Card 1 — Daily Capacity */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary-600" />
            קיבולת יומית
          </CardTitle>
        </CardHeader>

        <div className="space-y-5">
          <NumberField
            label="כמה לקוחות מופיעים בתור היומי"
            helper="מספר המשימות שהמשרד יכול לטפל בהן ביום"
            value={form.dailyCapacity}
            defaultValue={DEFAULTS.dailyCapacity}
            min={1}
            max={100}
            onChange={(v) => patch({ dailyCapacity: v })}
            suffix="לקוחות"
          />
          <NumberField
            label="מקומות שמורים לפריטים דחופים"
            helper="מקומות שמורים לאבני דרך גיליות (שאר המקומות לערך)"
            value={form.urgentReserveSlots}
            defaultValue={DEFAULTS.urgentReserveSlots}
            min={0}
            max={Math.max(form.dailyCapacity - 1, 0)}
            onChange={(v) => patch({ urgentReserveSlots: v })}
            suffix="מקומות"
          />
        </div>
      </Card>

      {/* Card 2 — Age Milestones */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cake className="h-4 w-4 text-primary-600" />
            אבני דרך גיליות
          </CardTitle>
        </CardHeader>

        <div className="space-y-5">
          <div>
            <Label>בחר גילים שמפעילים את הכלל</Label>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {MILESTONE_AGE_OPTIONS.map((age) => {
                const checked = form.ageMilestones.includes(age);
                return (
                  <label
                    key={age}
                    className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                      checked
                        ? "border-primary-500 bg-primary-50 text-primary-700"
                        : "border-surface-200 bg-white text-surface-700 hover:border-surface-300"
                    }`}
                  >
                    <span className="font-medium">גיל {age}</span>
                    <Checkbox
                      checked={checked}
                      onChange={() => toggleMilestone(age)}
                    />
                  </label>
                );
              })}
            </div>
            <Helper>ברירת המחדל: גיל 60 בלבד</Helper>
          </div>

          <div>
            <Label>כמה זמן אחרי המילסטון הלקוח עדיין רלוונטי</Label>
            <select
              value={form.milestoneFreshnessDays}
              onChange={(e) =>
                patch({ milestoneFreshnessDays: Number(e.target.value) })
              }
              className="mt-2 w-full rounded-lg border border-white/80 bg-white/80 px-3 py-2 text-sm text-surface-900 text-right backdrop-blur-sm focus:border-violet-400/60 focus:bg-white/90 focus:outline-none focus:ring-2 focus:ring-violet-400/25"
            >
              {FRESHNESS_OPTIONS.map((d) => (
                <option key={d} value={d}>
                  {d} ימים
                </option>
              ))}
            </select>
            <Helper>
              ברירת מחדל: {DEFAULTS.milestoneFreshnessDays} ימים
            </Helper>
          </div>

          <ToggleField
            label="דרוש פנסיה או חיסכון משמעותי"
            helper="דרישת מינימום כדי שהשיחה תהיה משמעותית"
            checked={form.milestoneRequiresPensionOrSavings}
            onChange={(v) => patch({ milestoneRequiresPensionOrSavings: v })}
          />

          {form.milestoneRequiresPensionOrSavings && (
            <NumberField
              label="סף חיסכון מצטבר מינימלי"
              helper="רק לקוחות עם פנסיה או חיסכון מעל הסף יופיעו"
              value={form.milestoneMinSavings}
              defaultValue={DEFAULTS.milestoneMinSavings}
              min={0}
              step={1000}
              onChange={(v) => patch({ milestoneMinSavings: v })}
              currency
            />
          )}
        </div>
      </Card>

      {/* Card 3 — High Value */}
      {/* Urgent categories — which types of insights get reserved slots */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-amber-500" />
            קטגוריות דחופות
          </CardTitle>
        </CardHeader>
        <div className="space-y-3">
          <p className="text-xs text-surface-500">
            בחר אילו סוגי תובנות מקבלים מקומות שמורים בתור (פריטים דחופים).
            שאר הקטגוריות מתחרות על המקומות הנותרים לפי ציון.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {URGENT_CATEGORY_OPTIONS.map((opt) => {
              const checked = form.urgentCategories.includes(opt.value);
              return (
                <label
                  key={opt.value}
                  className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ${
                    checked
                      ? "border-amber-300 bg-amber-50/40"
                      : "border-surface-200 bg-white hover:bg-surface-50"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      const next = checked
                        ? form.urgentCategories.filter((c) => c !== opt.value)
                        : [...form.urgentCategories, opt.value];
                      patch({ urgentCategories: next });
                    }}
                    className="mt-1 h-4 w-4 shrink-0 accent-amber-500"
                  />
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-medium text-surface-900">{opt.label}</span>
                    <p className="mt-0.5 text-xs text-surface-500">{opt.description}</p>
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gem className="h-4 w-4 text-primary-600" />
            לקוחות בעלי ערך גבוה
          </CardTitle>
        </CardHeader>

        <div className="space-y-5">
          <NumberField
            label="חיסכון מצטבר מינימלי"
            helper="לקוחות מעל הסף מקבלים עדיפות גבוהה"
            value={form.highValueSavingsThreshold}
            defaultValue={DEFAULTS.highValueSavingsThreshold}
            min={0}
            step={10_000}
            onChange={(v) => patch({ highValueSavingsThreshold: v })}
            currency
          />
          <NumberField
            label="פרמיה חודשית מינימלית"
            helper="לקוחות עם פרמיה חודשית מעל הסף מקבלים עדיפות גבוהה"
            value={form.highValueMonthlyPremiumThreshold}
            defaultValue={DEFAULTS.highValueMonthlyPremiumThreshold}
            min={0}
            step={100}
            onChange={(v) => patch({ highValueMonthlyPremiumThreshold: v })}
            currency
          />
        </div>
      </Card>

      {/* Card 4 — Cost Optimization */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Percent className="h-4 w-4 text-primary-600" />
            אופטימיזציית עלות
          </CardTitle>
        </CardHeader>

        <div className="space-y-5">
          <NumberField
            label="דמי ניהול מעל"
            helper="דמי ניהול מעל הסף יסומנו כזדמנות חיסכון"
            value={form.managementFeeThreshold}
            defaultValue={DEFAULTS.managementFeeThreshold}
            min={0}
            max={10}
            step={0.1}
            onChange={(v) => patch({ managementFeeThreshold: v })}
            suffix="%"
            decimals={1}
          />
          <NumberField
            label="חיסכון מינימלי לרלוונטיות"
            helper="אופטימיזציה רלוונטית רק כשיש מספיק חיסכון כדי להצדיק העברה"
            value={form.costOptimizationMinSavings}
            defaultValue={DEFAULTS.costOptimizationMinSavings}
            min={0}
            step={10_000}
            onChange={(v) => patch({ costOptimizationMinSavings: v })}
            currency
          />
        </div>
      </Card>

      {/* Card 5 — Suppression */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldOff className="h-4 w-4 text-primary-600" />
            דיכוי וחפיפות
          </CardTitle>
        </CardHeader>

        <div className="space-y-5">
          <NumberField
            label="כמה ימים לא להציג לקוח שנדחה"
            helper="זמן המתנה אחרי Dismiss לפני שהלקוח יוכל לחזור לתור"
            value={form.cooldownAfterDismissalDays}
            defaultValue={DEFAULTS.cooldownAfterDismissalDays}
            min={0}
            max={365}
            onChange={(v) => patch({ cooldownAfterDismissalDays: v })}
            suffix="ימים"
          />
          <NumberField
            label="כמה ימים אחרי פנייה ללקוח לא להציג שוב"
            helper="מונע הטרדה — אחרי הודעה נשלחת אנחנו לא מציגים את הלקוח שוב"
            value={form.recentContactSuppressionDays}
            defaultValue={DEFAULTS.recentContactSuppressionDays}
            min={0}
            max={365}
            onChange={(v) => patch({ recentContactSuppressionDays: v })}
            suffix="ימים"
          />

          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <div className="flex items-start gap-2">
              <Info className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-800 leading-relaxed">
                פריטים דחופים (אבני דרך גיליות) עוקפים את החוק הזה
              </p>
            </div>
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
          <span
            className="text-[11px] text-surface-400"
            title="ברירת המחדל המקורית"
          >
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
