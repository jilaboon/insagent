"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScoreBadge } from "@/components/shared/score-badge";
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
          "group rounded-xl border border-surface-200 bg-white shadow-xs transition-all duration-300",
          "hover:border-primary-200 hover:shadow-sm",
          fading && "opacity-0 scale-[0.98] pointer-events-none",
          expanded && "border-primary-200 shadow-sm"
        )}
      >
        {/* Main row */}
        <div className={cn("flex items-start gap-4", compact ? "p-4" : "p-5")}>
          {/* Rank */}
          <div
            className={cn(
              "shrink-0 flex items-center justify-center rounded-full font-bold text-white number",
              "bg-gradient-to-br from-primary-500 to-primary-700 shadow-xs",
              compact ? "h-9 w-9 text-xs" : "h-11 w-11 text-sm"
            )}
          >
            {entry.rank}
          </div>

          {/* Body */}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <Link
                href={`/customers/${customer.id}`}
                className={cn(
                  "font-semibold text-surface-900 hover:text-primary-700 transition-colors",
                  compact ? "text-sm" : "text-base"
                )}
              >
                {fullName}
              </Link>
              {customer.age != null && (
                <span className="text-xs text-surface-500 number">
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

            {/* Why today */}
            <div className="mt-2 flex items-start gap-2">
              <span className="text-base leading-5 shrink-0">
                {reasonCategoryIcons[entry.reasonCategory] || "⭐"}
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-primary-600">
                    למה היום?
                  </span>
                  <Badge variant="primary">
                    {reasonCategoryLabels[entry.reasonCategory] ||
                      entry.reasonCategory}
                  </Badge>
                </div>
                <p className="mt-1 text-sm font-medium text-surface-800 leading-snug">
                  {whyTodayReason}
                </p>
              </div>
            </div>

            {/* Primary insight + supporting */}
            {primaryInsight && (
              <div className="mt-3 flex items-center gap-2 text-xs text-surface-600">
                <span className="line-clamp-1 flex-1">
                  <span className="font-medium text-surface-700">
                    {primaryInsight.title}
                  </span>
                  {insightCategoryLabels[
                    primaryInsight.category as keyof typeof insightCategoryLabels
                  ] && (
                    <span className="text-surface-400">
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
                  <span className="shrink-0 rounded-md bg-surface-100 px-2 py-0.5 text-[11px] text-surface-600 number">
                    +{supportingCount} תובנות נוספות
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex shrink-0 items-center gap-2">
            {showPromote && (
              <button
                onClick={() => onPromote?.(entry)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100"
              >
                <ArrowUpCircle className="h-3.5 w-3.5" />
                העלה להיום
              </button>
            )}
            {!expanded && !compact && (
              <button
                onClick={() => setExpanded(true)}
                className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-l from-primary-600 to-primary-500 px-4 py-2 text-sm font-medium text-white shadow-xs transition-all hover:from-primary-700 hover:to-primary-600 hover:shadow-sm"
              >
                <Sparkles className="h-4 w-4" />
                צור הודעה
              </button>
            )}
            <button
              onClick={() => setExpanded((v) => !v)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-surface-200 text-surface-500 hover:bg-surface-50 hover:text-surface-800"
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
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-surface-200 text-surface-500 hover:bg-surface-50 hover:text-surface-800"
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
                  <div className="absolute left-0 top-full z-20 mt-1 w-48 rounded-lg border border-surface-200 bg-white py-1 shadow-md">
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

        {/* Expanded content */}
        {expanded && (
          <div className="border-t border-surface-100 bg-surface-50/40 px-5 py-5 space-y-5 animate-[fadeIn_0.2s_ease-out_forwards]">
            {/* Customer contact strip */}
            {(customer.phone || customer.email) && (
              <div className="flex flex-wrap items-center gap-3 text-xs text-surface-600">
                {customer.phone && (
                  <a
                    href={`tel:${customer.phone}`}
                    className="inline-flex items-center gap-1.5 rounded-md border border-surface-200 bg-white px-2.5 py-1 hover:bg-surface-50"
                  >
                    <Phone className="h-3 w-3 text-surface-400" />
                    <span className="number">{customer.phone}</span>
                  </a>
                )}
                {customer.email && (
                  <a
                    href={`mailto:${customer.email}`}
                    className="inline-flex items-center gap-1.5 rounded-md border border-surface-200 bg-white px-2.5 py-1 hover:bg-surface-50"
                  >
                    <Mail className="h-3 w-3 text-surface-400" />
                    <span className="truncate max-w-[220px]">
                      {customer.email}
                    </span>
                  </a>
                )}
                <Link
                  href={`/customers/${customer.id}`}
                  className="mr-auto text-xs font-medium text-primary-600 hover:text-primary-700"
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
            <div className="flex flex-wrap items-center gap-2 border-t border-surface-200 pt-4">
              <Button
                variant="primary"
                size="md"
                onClick={() => handleAction("COMPLETED")}
                disabled={action.isPending}
                className="bg-emerald-600 hover:bg-emerald-700"
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
                className="text-red-600 hover:bg-red-50 hover:text-red-700"
              >
                <X className="h-4 w-4" />
                לא רלוונטי
              </Button>
              <Button
                variant="ghost"
                size="md"
                onClick={() => openModal("BLOCKED")}
                className="text-amber-600 hover:bg-amber-50 hover:text-amber-700"
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
      className="flex w-full items-center gap-2 px-3 py-2 text-right text-xs text-surface-700 hover:bg-surface-50"
    >
      <span className="text-surface-400">{icon}</span>
      {children}
    </button>
  );
}

function InsightRow({
  insight,
  primary,
}: {
  insight: {
    id: string;
    title: string;
    summary: string;
    category: string;
    strengthScore: number | null;
  };
  primary?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border px-3 py-2.5",
        primary
          ? "border-primary-200 bg-primary-50/40"
          : "border-surface-200 bg-white"
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {primary && <Badge variant="primary">ראשי</Badge>}
          <span className="text-sm font-medium text-surface-900 truncate">
            {insight.title}
          </span>
        </div>
        {insight.summary && (
          <p className="mt-1 text-xs text-surface-500 line-clamp-2">
            {insight.summary}
          </p>
        )}
      </div>
      {insight.strengthScore != null && (
        <div className="shrink-0">
          <ScoreBadge score={insight.strengthScore} />
        </div>
      )}
    </div>
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
          <h4 className="text-xs font-semibold uppercase tracking-wide text-surface-500">
            בחר תובנות להודעה ({selectedCount})
          </h4>
          {allInsights.length > 1 && (
            <div className="flex items-center gap-2">
              <button
                onClick={() =>
                  setSelectedIds(new Set(allInsights.map((i) => i.id)))
                }
                className="text-xs text-primary-600 hover:text-primary-700"
              >
                בחר הכל
              </button>
              <span className="text-surface-300">|</span>
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
                  "flex items-start gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors",
                  isChecked
                    ? "border-primary-300 bg-primary-50/40"
                    : "border-surface-200 bg-white hover:bg-surface-50"
                )}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggle(ins.id)}
                  className="mt-1 h-4 w-4 shrink-0 accent-primary-600"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {isPrimary && <Badge variant="primary">ראשי</Badge>}
                    <span className="text-sm font-medium text-surface-900 truncate">
                      {ins.title}
                    </span>
                  </div>
                  {ins.summary && (
                    <p className="mt-1 text-xs text-surface-500 line-clamp-2">
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
      <div className="rounded-lg border border-surface-200 bg-white p-4">
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-surface-500">
          הודעה ללקוח
        </h4>

        {selectedCount === 0 ? (
          <p className="text-xs text-surface-500">
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
            <p className="text-xs text-surface-500">
              {selectedCount} תובנות נבחרו — ה-AI ישלב אותן להודעה אחת טבעית
            </p>
            <button
              onClick={handleGenerate}
              disabled={generate.isPending}
              className="group relative inline-flex items-center gap-2 rounded-lg bg-gradient-to-l from-primary-600 to-primary-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:from-primary-700 hover:to-primary-600 hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
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
