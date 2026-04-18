"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScoreBadge } from "@/components/shared/score-badge";
import { NeonRing } from "@/components/prism/neon-ring";
import { ChromaticBadge } from "@/components/prism/chromatic-badge";
import { MessageComposer } from "@/components/shared/message-composer";
import { ActionModal, type ActionKind } from "@/components/queue/action-modal";
import {
  useQueueAction,
  useGenerateCombinedMessage,
  type QueueEntryWithRelations,
  type QueueStatus,
} from "@/lib/api/hooks";
import type { MessageDraftItem } from "@/lib/types/message";
import {
  reasonCategoryLabels,
  reasonCategoryIcons,
  insightCategoryLabels,
} from "@/lib/constants";
import {
  ChevronDown,
  ChevronUp,
  MoreHorizontal,
  Check,
  Clock,
  X,
  Ban,
  ExternalLink,
  Sparkles,
  Phone,
  Mail,
  ArrowUpCircle,
  Info,
} from "lucide-react";
import Link from "next/link";

interface CustomerCardProps {
  entry: QueueEntryWithRelations;
  compact?: boolean;
  showPromote?: boolean;
  onPromote?: (entry: QueueEntryWithRelations) => void;
  onAfterAction?: (
    promoted: QueueEntryWithRelations | null,
    entry: QueueEntryWithRelations
  ) => void;
}

type ActionableStatus = Exclude<QueueStatus, "PENDING">;

type PrismColor = "indigo" | "violet" | "cyan" | "rose";

// Maps queue reason categories to Prism palette colors.
// AGE_MILESTONE→violet, HIGH_VALUE→rose, COST_OPTIMIZATION→cyan,
// COVERAGE_GAP→indigo, URGENT_EXPIRY→rose, SERVICE→indigo, CROSS_SELL→violet.
function mapReasonToColor(reason: string): PrismColor {
  switch (reason) {
    case "AGE_MILESTONE":
    case "CROSS_SELL":
      return "violet";
    case "HIGH_VALUE":
    case "URGENT_EXPIRY":
      return "rose";
    case "COST_OPTIMIZATION":
      return "cyan";
    case "COVERAGE_GAP":
    case "SERVICE":
      return "indigo";
    default:
      return "violet";
  }
}

export function CustomerCard({
  entry,
  compact = false,
  showPromote = false,
  onPromote,
  onAfterAction,
}: CustomerCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [modalKind, setModalKind] = useState<ActionKind | null>(null);
  const [fading, setFading] = useState(false);
  const action = useQueueAction();

  const { customer, primaryInsight, supportingInsights, whyTodayReason } =
    entry;
  const fullName =
    customer.fullName || `${customer.firstName} ${customer.lastName}`.trim();
  const supportingCount = supportingInsights?.length ?? 0;
  const reasonColor = mapReasonToColor(entry.reasonCategory);
  const reasonEmoji = reasonCategoryIcons[entry.reasonCategory] || "⭐";
  const reasonLabel =
    reasonCategoryLabels[entry.reasonCategory] || entry.reasonCategory;
  // The gauge shows the queue PRIORITY score (0-100) — same number that
  // drives the rank. Falls back to insight strength for old entries built
  // before priorityScore was added to debugContext.
  const priorityScore = entry.priorityScore ?? primaryInsight?.strengthScore ?? null;
  const breakdown = entry.priorityBreakdown ?? null;

  async function handleAction(
    status: ActionableStatus,
    payload: { note?: string; postponeUntil?: string } = {}
  ) {
    setFading(true);
    try {
      const result = await action.mutateAsync({
        id: entry.id,
        status,
        ...payload,
      });
      setModalKind(null);
      onAfterAction?.(result.promoted ?? null, entry);
    } catch {
      setFading(false);
    }
  }

  function openModal(kind: ActionKind) {
    setMenuOpen(false);
    setModalKind(kind);
  }

  return (
    <>
      <div
        className={cn(
          // Glass-friendly card — lets the Card/ambient field show through.
          // Sits on a translucent white sheet with a violet hairline shadow.
          "group relative rounded-[20px] border border-white/65 bg-white/55 backdrop-blur-xl backdrop-saturate-150",
          "transition-all duration-300 ease-out",
          "hover:-translate-y-0.5 hover:border-white/80 hover:bg-white/65",
          expanded && "border-white/85 bg-white/70",
          fading && "opacity-0 scale-[0.98] pointer-events-none",
          "animate-[slideUp_0.45s_cubic-bezier(0.22,1,0.36,1)_both]"
        )}
        style={{
          animationDelay: `${Math.min(entry.rank * 60, 480)}ms`,
          boxShadow:
            "0 1px 0 0 rgba(255,255,255,0.9) inset, " +
            "0 -1px 0 0 rgba(130,120,200,0.08) inset, " +
            "0 10px 30px -14px rgba(80,70,180,0.18), " +
            "0 2px 8px -2px rgba(80,70,180,0.08)",
        }}
      >
        {/* Soft chromatic glow behind the card, tinted by the reason color.
            Intensifies on hover. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-60 transition-opacity duration-500 group-hover:opacity-100"
          style={{
            background:
              reasonColor === "violet"
                ? "radial-gradient(60% 90% at 100% 0%, rgba(167,139,250,0.22), transparent 60%)"
                : reasonColor === "rose"
                  ? "radial-gradient(60% 90% at 100% 0%, rgba(240,171,252,0.22), transparent 60%)"
                  : reasonColor === "cyan"
                    ? "radial-gradient(60% 90% at 100% 0%, rgba(34,211,238,0.22), transparent 60%)"
                    : "radial-gradient(60% 90% at 100% 0%, rgba(129,140,248,0.22), transparent 60%)",
          }}
        />

        {/* Main row */}
        <div
          className={cn(
            "relative flex items-start gap-4",
            compact ? "p-4" : "p-5"
          )}
        >
          {/* Rank — gradient disc with subtle glow */}
          <div
            className={cn(
              "shrink-0 flex items-center justify-center rounded-full font-light text-white number border border-white/40",
              compact ? "h-10 w-10 text-xs" : "h-12 w-12 text-sm"
            )}
            style={{
              background:
                "linear-gradient(135deg, #818CF8 0%, #A78BFA 55%, #F0ABFC 100%)",
              boxShadow:
                "0 1px 0 rgba(255,255,255,0.55) inset, " +
                "0 6px 18px -6px rgba(167,139,250,0.55), " +
                "0 2px 6px -1px rgba(129,140,248,0.35)",
            }}
          >
            {entry.rank}
          </div>

          {/* Body */}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <Link
                href={`/customers/${customer.id}`}
                className={cn(
                  "font-light tracking-tight text-surface-900 hover:text-violet-700 transition-colors",
                  compact ? "text-base" : "text-lg"
                )}
              >
                {fullName}
              </Link>
              {customer.age != null && (
                <span className="text-xs text-surface-600 number">
                  בן {customer.age}
                </span>
              )}
              {typeof customer.activePolicyCount === "number" && (
                <Badge variant="muted">
                  <span className="number">{customer.activePolicyCount}</span>
                  {" פוליסות"}
                </Badge>
              )}
            </div>

            {/* Why today — Prism ChromaticBadge replaces the old inline icon+badge */}
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-violet-700/70">
                למה היום?
              </span>
              <ChromaticBadge
                icon={reasonEmoji}
                label={reasonLabel}
                color={reasonColor}
              />
            </div>
            <p className="mt-2 text-sm font-normal text-surface-800 leading-snug">
              {whyTodayReason}
            </p>

            {/* Primary insight + supporting count */}
            {primaryInsight && (
              <div className="mt-3 flex items-center gap-2 text-xs text-surface-600">
                <span className="line-clamp-1 flex-1">
                  <span className="font-medium text-surface-800">
                    {primaryInsight.title}
                  </span>
                  {insightCategoryLabels[
                    primaryInsight.category as keyof typeof insightCategoryLabels
                  ] && (
                    <span className="text-surface-500">
                      {" · "}
                      {
                        insightCategoryLabels[
                          primaryInsight.category as keyof typeof insightCategoryLabels
                        ]
                      }
                    </span>
                  )}
                </span>
                {supportingCount > 0 && (
                  <span className="shrink-0 rounded-full border border-white/60 bg-white/50 px-2 py-0.5 text-[11px] text-surface-600 number backdrop-blur-md">
                    +{supportingCount} תובנות נוספות
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Right column — primary score ring + actions */}
          <div className="flex shrink-0 flex-col items-end gap-2">
            {priorityScore != null && (
              <PriorityGauge
                score={priorityScore}
                size={compact ? 44 : 56}
                reasonLabel={reasonLabel}
                breakdown={breakdown}
              />
            )}

            <div className="flex items-center gap-2">
              {showPromote && (
                <button
                  onClick={() => onPromote?.(entry)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300/50 bg-amber-50/60 px-3 py-1.5 text-xs font-medium text-amber-700 backdrop-blur-md hover:bg-amber-100/70 hover:border-amber-400/60"
                >
                  <ArrowUpCircle className="h-3.5 w-3.5" />
                  העלה להיום
                </button>
              )}
              {!expanded && !compact && (
                <button
                  onClick={() => setExpanded(true)}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-lg border border-white/40 px-4 py-2 text-sm font-medium text-white transition-all",
                    "bg-gradient-to-l from-indigo-500 via-violet-500 to-rose-400",
                    "shadow-[0_1px_0_rgba(255,255,255,0.5)_inset,0_8px_24px_-10px_rgba(167,139,250,0.65),0_2px_8px_-2px_rgba(129,140,248,0.35)]",
                    "hover:shadow-[0_1px_0_rgba(255,255,255,0.6)_inset,0_12px_30px_-10px_rgba(167,139,250,0.85),0_4px_12px_-2px_rgba(240,171,252,0.45)]",
                    "hover:brightness-[1.05] active:brightness-[0.98]"
                  )}
                >
                  <Sparkles className="h-4 w-4" />
                  צור הודעה
                </button>
              )}
              <button
                onClick={() => setExpanded((v) => !v)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/60 bg-white/50 text-surface-600 backdrop-blur-md hover:bg-white/70 hover:text-violet-700"
                aria-label={expanded ? "סגור" : "הרחב"}
              >
                {expanded ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </button>
              <div className="relative">
                <button
                  onClick={() => setMenuOpen((v) => !v)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/60 bg-white/50 text-surface-600 backdrop-blur-md hover:bg-white/70 hover:text-violet-700"
                  aria-label="אפשרויות"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
                {menuOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setMenuOpen(false)}
                    />
                    <div
                      className="absolute left-0 top-full z-20 mt-1 w-48 rounded-lg border border-white/70 bg-white/85 py-1 backdrop-blur-xl shadow-[0_8px_24px_-8px_rgba(80,70,180,0.22)]"
                    >
                      <MenuItem
                        icon={<Clock className="h-3.5 w-3.5" />}
                        onClick={() => openModal("POSTPONED")}
                      >
                        דחה למועד אחר
                      </MenuItem>
                      <MenuItem
                        icon={<X className="h-3.5 w-3.5" />}
                        onClick={() => openModal("DISMISSED")}
                      >
                        לא רלוונטי
                      </MenuItem>
                      <MenuItem
                        icon={<Ban className="h-3.5 w-3.5" />}
                        onClick={() => openModal("BLOCKED")}
                      >
                        חסום
                      </MenuItem>
                      <div className="my-1 border-t border-surface-100" />
                      <MenuItem
                        icon={<ExternalLink className="h-3.5 w-3.5" />}
                        onClick={() => {
                          setMenuOpen(false);
                          handleAction("EXTERNAL");
                        }}
                      >
                        טופל מחוץ למערכת
                      </MenuItem>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Expanded content */}
        {expanded && (
          <div className="relative border-t border-white/60 bg-white/30 backdrop-blur-md px-5 py-5 space-y-5 animate-[fadeIn_0.2s_ease-out_forwards]">
            {/* Customer contact strip */}
            {(customer.phone || customer.email) && (
              <div className="flex flex-wrap items-center gap-3 text-xs text-surface-600">
                {customer.phone && (
                  <a
                    href={`tel:${customer.phone}`}
                    className="inline-flex items-center gap-1.5 rounded-md border border-white/60 bg-white/70 px-2.5 py-1 backdrop-blur-md hover:bg-white/85"
                  >
                    <Phone className="h-3 w-3 text-surface-500" />
                    <span className="number">{customer.phone}</span>
                  </a>
                )}
                {customer.email && (
                  <a
                    href={`mailto:${customer.email}`}
                    className="inline-flex items-center gap-1.5 rounded-md border border-white/60 bg-white/70 px-2.5 py-1 backdrop-blur-md hover:bg-white/85"
                  >
                    <Mail className="h-3 w-3 text-surface-500" />
                    <span className="truncate max-w-[220px]">
                      {customer.email}
                    </span>
                  </a>
                )}
                <Link
                  href={`/customers/${customer.id}`}
                  className="mr-auto text-xs font-medium text-violet-700 hover:text-violet-800"
                >
                  פתח כרטיס מלא ←
                </Link>
              </div>
            )}

            {/* Insight selection + combined message */}
            <InsightSelectAndMessage
              primaryInsight={primaryInsight}
              supportingInsights={supportingInsights ?? []}
              customerName={fullName}
            />

            {/* Bottom actions */}
            <div className="flex flex-wrap items-center gap-2 border-t border-white/60 pt-4">
              <Button
                variant="primary"
                size="md"
                onClick={() => handleAction("COMPLETED")}
                disabled={action.isPending}
                className="!bg-gradient-to-l !from-emerald-500 !via-teal-500 !to-cyan-500 !shadow-[0_1px_0_rgba(255,255,255,0.5)_inset,0_8px_24px_-10px_rgba(52,211,153,0.55),0_2px_8px_-2px_rgba(34,211,238,0.35)] hover:brightness-[1.05]"
              >
                <Check className="h-4 w-4" />
                בוצע
              </Button>
              <Button
                variant="secondary"
                size="md"
                onClick={() => openModal("POSTPONED")}
              >
                <Clock className="h-4 w-4" />
                דחה
              </Button>
              <Button
                variant="ghost"
                size="md"
                onClick={() => openModal("DISMISSED")}
                className="text-rose-600 hover:bg-rose-500/10 hover:text-rose-700"
              >
                <X className="h-4 w-4" />
                לא רלוונטי
              </Button>
              <Button
                variant="ghost"
                size="md"
                onClick={() => openModal("BLOCKED")}
                className="text-amber-600 hover:bg-amber-500/10 hover:text-amber-700"
              >
                <Ban className="h-4 w-4" />
                חסום
              </Button>
              <Button
                variant="ghost"
                size="md"
                onClick={() => handleAction("EXTERNAL")}
              >
                <ExternalLink className="h-4 w-4" />
                טופל מחוץ למערכת
              </Button>
            </div>
          </div>
        )}
      </div>

      {modalKind && (
        <ActionModal
          kind={modalKind}
          customerName={fullName}
          onCancel={() => setModalKind(null)}
          onConfirm={(payload) => {
            handleAction(modalKind, payload);
          }}
          isSubmitting={action.isPending}
        />
      )}
    </>
  );
}

// ============================================================
// Priority gauge — neon ring + hover info popover explaining the rank
// ============================================================

function PriorityGauge({
  score,
  size,
  reasonLabel,
  breakdown,
}: {
  score: number;
  size: number;
  reasonLabel: string;
  breakdown: QueueEntryWithRelations["priorityBreakdown"] | null;
}) {
  return (
    <div className="group/gauge relative flex items-center gap-1">
      <NeonRing value={score} size={size} />
      <button
        type="button"
        aria-label="איך חישבנו את הדחיפות?"
        className="flex h-5 w-5 items-center justify-center rounded-full border border-white/60 bg-white/60 text-surface-500 backdrop-blur-md transition-colors hover:bg-white/85 hover:text-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-400/40"
      >
        <Info className="h-3 w-3" />
      </button>

      {/* Hover / focus popover */}
      <div
        className="pointer-events-none absolute left-0 top-full z-30 mt-2 w-64 rounded-xl border border-white/70 bg-white/90 p-3 text-right text-xs text-surface-700 opacity-0 shadow-[0_12px_30px_-10px_rgba(80,70,180,0.25)] backdrop-blur-xl transition-opacity duration-150 group-hover/gauge:pointer-events-auto group-hover/gauge:opacity-100 group-focus-within/gauge:pointer-events-auto group-focus-within/gauge:opacity-100"
      >
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-violet-700/80">
          איך חושב הציון
        </p>
        {breakdown ? (
          <ul className="space-y-1.5">
            <BreakdownRow
              label={`בסיס: ${reasonLabel}`}
              value={breakdown.categoryFloor}
              isBase
            />
            <BreakdownRow
              label="חוזק התובנה"
              value={breakdown.strengthBonus}
            />
            <BreakdownRow label="ערך תיק הלקוח" value={breakdown.valueBonus} />
            {breakdown.renewalPenalty !== 0 && (
              <BreakdownRow
                label="קנס חידוש (נמצא ב-BAFI)"
                value={breakdown.renewalPenalty}
              />
            )}
            <li className="mt-2 flex items-center justify-between border-t border-surface-200/70 pt-2 font-semibold text-surface-900">
              <span className="number">{score}</span>
              <span>ציון דחיפות</span>
            </li>
          </ul>
        ) : (
          <p className="text-surface-500">
            אין פירוט זמין עבור רשומה זו. בנייה מחדש של התור תייצר פירוט.
          </p>
        )}
      </div>
    </div>
  );
}

function BreakdownRow({
  label,
  value,
  isBase = false,
}: {
  label: string;
  value: number;
  isBase?: boolean;
}) {
  const sign = value > 0 ? "+" : "";
  const color =
    value > 0
      ? "text-emerald-600"
      : value < 0
        ? "text-rose-600"
        : "text-surface-500";
  return (
    <li className="flex items-center justify-between gap-3">
      <span className={cn("number", isBase ? "text-surface-700" : color)}>
        {isBase ? value : `${sign}${value}`}
      </span>
      <span className="truncate text-surface-600">{label}</span>
    </li>
  );
}

function MenuItem({
  icon,
  children,
  onClick,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2 px-3 py-2 text-right text-xs text-surface-700 hover:bg-white/70"
    >
      <span className="text-surface-500">{icon}</span>
      {children}
    </button>
  );
}

// ============================================================
// Insight selection + combined message generation
// ============================================================

interface InsightLite {
  id: string;
  title: string;
  summary: string;
  category: string;
  strengthScore: number | null;
}

function InsightSelectAndMessage({
  primaryInsight,
  supportingInsights,
  customerName,
}: {
  primaryInsight: InsightLite | null;
  supportingInsights: InsightLite[];
  customerName: string;
}) {
  const allInsights = primaryInsight
    ? [primaryInsight, ...supportingInsights]
    : supportingInsights;

  // By default, only the primary insight is selected
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(primaryInsight ? [primaryInsight.id] : [])
  );
  const [generatedMessage, setGeneratedMessage] =
    useState<MessageDraftItem | null>(null);
  const generate = useGenerateCombinedMessage();

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleGenerate() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    try {
      const result = await generate.mutateAsync({
        insightIds: ids,
        combined: true,
      });
      const raw = result as unknown as Record<string, unknown>;
      setGeneratedMessage({
        id: (raw.messageId || raw.id || "") as string,
        customerId: "",
        customerName,
        insightId: ids[0] ?? null,
        insightTitle: null,
        body: (raw.body || "") as string,
        tone: null,
        purpose: null,
        status: "DRAFT",
        generatedBy: "AI",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    } catch {
      /* handled via mutation state */
    }
  }

  const selectedCount = selectedIds.size;
  const isSingle = selectedCount === 1;

  return (
    <div className="space-y-4">
      {/* Insight selector */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-surface-600">
            בחר תובנות להודעה ({selectedCount})
          </h4>
          {allInsights.length > 1 && (
            <div className="flex items-center gap-2">
              <button
                onClick={() =>
                  setSelectedIds(new Set(allInsights.map((i) => i.id)))
                }
                className="text-xs text-violet-700 hover:text-violet-800"
              >
                בחר הכל
              </button>
              <span className="text-surface-400">|</span>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="text-xs text-surface-500 hover:text-surface-700"
              >
                נקה
              </button>
            </div>
          )}
        </div>
        <div className="space-y-2">
          {allInsights.map((ins, idx) => {
            const isChecked = selectedIds.has(ins.id);
            const isPrimary = idx === 0 && primaryInsight;
            return (
              <label
                key={ins.id}
                className={cn(
                  "flex items-start gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors backdrop-blur-md",
                  isChecked
                    ? "border-violet-300/60 bg-violet-500/8"
                    : "border-white/60 bg-white/55 hover:bg-white/70"
                )}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggle(ins.id)}
                  className="mt-1 h-4 w-4 shrink-0 accent-violet-600"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {isPrimary && <Badge variant="primary">ראשי</Badge>}
                    <span className="text-sm font-medium text-surface-900 truncate">
                      {ins.title}
                    </span>
                  </div>
                  {ins.summary && (
                    <p className="mt-1 text-xs text-surface-600 line-clamp-2">
                      {ins.summary}
                    </p>
                  )}
                </div>
                {ins.strengthScore != null && (
                  <div className="shrink-0">
                    <ScoreBadge score={ins.strengthScore} />
                  </div>
                )}
              </label>
            );
          })}
        </div>
      </div>

      {/* Message generator */}
      <div className="rounded-lg border border-white/60 bg-white/55 p-4 backdrop-blur-md">
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-surface-600">
          הודעה ללקוח
        </h4>

        {selectedCount === 0 ? (
          <p className="text-xs text-surface-600">
            בחר לפחות תובנה אחת כדי לייצר הודעה
          </p>
        ) : isSingle && !generatedMessage ? (
          // Single insight — use the existing MessageComposer flow
          <MessageComposer
            insightId={Array.from(selectedIds)[0]}
            customerName={customerName}
          />
        ) : generatedMessage ? (
          // Combined message generated — show as MessageComposer preview
          <MessageComposer
            insightId={Array.from(selectedIds)[0]}
            customerName={customerName}
            existingMessage={generatedMessage}
          />
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-surface-600">
              {selectedCount} תובנות נבחרו — ה-AI ישלב אותן להודעה אחת טבעית
            </p>
            <button
              onClick={handleGenerate}
              disabled={generate.isPending}
              className={cn(
                "group relative inline-flex items-center gap-2 rounded-lg border border-white/40 px-4 py-2 text-sm font-medium text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed",
                "bg-gradient-to-l from-indigo-500 via-violet-500 to-rose-400",
                "shadow-[0_1px_0_rgba(255,255,255,0.5)_inset,0_8px_24px_-10px_rgba(167,139,250,0.65),0_2px_8px_-2px_rgba(129,140,248,0.35)]",
                "hover:shadow-[0_1px_0_rgba(255,255,255,0.6)_inset,0_12px_30px_-10px_rgba(167,139,250,0.85),0_4px_12px_-2px_rgba(240,171,252,0.45)]",
                "hover:brightness-[1.05]"
              )}
            >
              <Sparkles className="h-4 w-4" />
              {generate.isPending ? "יוצר הודעה משולבת..." : "צור הודעה משולבת"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
