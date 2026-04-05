import { cn } from "@/lib/utils";
import { Clock, ShieldCheck, ShieldAlert, AlertTriangle } from "lucide-react";

// ============================================================
// Data Freshness Indicator
// ============================================================

interface DataFreshnessProps {
  date: Date | string | null | undefined;
  className?: string;
}

export function DataFreshness({ date, className }: DataFreshnessProps) {
  const d = date ? (typeof date === "string" ? new Date(date) : date) : null;
  const { label, level } = getFreshnessInfo(d);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium",
        level === "fresh" && "text-emerald-600",
        level === "partial" && "text-amber-600",
        level === "stale" && "text-red-500",
        className
      )}
    >
      <Clock className="h-3 w-3" />
      {label}
    </span>
  );
}

function getFreshnessInfo(date: Date | null): {
  label: string;
  level: "fresh" | "partial" | "stale";
} {
  if (!date) return { label: "לא ידוע", level: "stale" };
  const months = Math.round(
    (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24 * 30)
  );
  if (months <= 3) return { label: "עדכני", level: "fresh" };
  if (months <= 12)
    return { label: `עודכן לפני ${months} חודשים`, level: "partial" };
  return { label: `עודכן לפני ${months} חודשים`, level: "stale" };
}

// ============================================================
// Urgency Indicator
// ============================================================

interface UrgencyProps {
  level: 0 | 1 | 2;
  className?: string;
}

const urgencyConfig = [
  { label: "נמוכה", color: "text-emerald-600", bg: "bg-emerald-50" },
  { label: "בינונית", color: "text-amber-600", bg: "bg-amber-50" },
  { label: "גבוהה", color: "text-red-600", bg: "bg-red-50" },
] as const;

export function UrgencyIndicator({ level, className }: UrgencyProps) {
  const config = urgencyConfig[level];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium",
        config.bg,
        config.color,
        className
      )}
    >
      {level === 2 && <AlertTriangle className="h-3 w-3" />}
      {config.label}
    </span>
  );
}

// ============================================================
// Recommendation Strength
// ============================================================

interface StrengthProps {
  level: 0 | 1 | 2;
  className?: string;
}

const strengthConfig = [
  { label: "חלשה", icon: ShieldAlert, color: "text-surface-500" },
  { label: "בינונית", icon: ShieldCheck, color: "text-amber-600" },
  { label: "חזקה", icon: ShieldCheck, color: "text-primary-600" },
] as const;

export function StrengthIndicator({ level, className }: StrengthProps) {
  const config = strengthConfig[level];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium",
        config.color,
        className
      )}
    >
      <config.icon className="h-3.5 w-3.5" />
      {config.label}
    </span>
  );
}

// ============================================================
// Profile Completeness
// ============================================================

interface CompletenessProps {
  level: 0 | 1 | 2;
  className?: string;
}

const completenessConfig = [
  { label: "חלקי", color: "text-red-500", percent: 33 },
  { label: "בינוני", color: "text-amber-500", percent: 66 },
  { label: "מלא", color: "text-emerald-600", percent: 100 },
] as const;

export function CompletenessIndicator({ level, className }: CompletenessProps) {
  const config = completenessConfig[level];
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-200">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            level === 0 && "bg-red-400",
            level === 1 && "bg-amber-400",
            level === 2 && "bg-emerald-500"
          )}
          style={{ width: `${config.percent}%` }}
        />
      </div>
      <span className={cn("text-xs font-medium", config.color)}>
        {config.label}
      </span>
    </div>
  );
}
