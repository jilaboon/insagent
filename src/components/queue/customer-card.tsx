"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MessageComposer } from "@/components/shared/message-composer";
import { ActionModal, type ActionKind } from "@/components/queue/action-modal";
import {
  useQueueAction,
  type QueueEntryWithRelations,
  type QueueStatus,
} from "@/lib/api/hooks";
import { OFFICE_BUCKET_LABELS, type OfficeBucket } from "@/lib/queue/buckets";
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

type PrismColor = "indigo" | "violet" | "cyan" | "rose" | "amber";

// Maps office buckets (רפי's own taxonomy) to Prism palette colors.
// כיסוי → indigo, חיסכון → cyan, שירות → violet, כללי → rose,
// חידוש → amber (and normally lives in the BAFI lane, not here).
function bucketColor(bucket: OfficeBucket | undefined): PrismColor {
  switch (bucket) {
    case "coverage":
      return "indigo";
    case "savings":
      return "cyan";
    case "service":
      return "violet";
    case "renewal":
      return "amber";
    case "general":
    default:
      return "rose";
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
  const bucket: OfficeBucket = entry.bucket ?? "general";
  const bucketLabel = OFFICE_BUCKET_LABELS[bucket];
  const reasonColor = bucketColor(bucket);

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
          // Glass-friendly card — bg-white/85 is near-opaque so we don't need
          // heavy backdrop-blur. Previously backdrop-blur-xl forced a full
          // composite behind every card on every scroll frame.
          "group relative rounded-[20px] border border-white/65 bg-white/85",
          "transition-all duration-300 ease-out",
          "hover:-translate-y-0.5 hover:border-white/90 hover:bg-white/95",
          expanded && "border-white/90 bg-white/95",
          fading && "opacity-0 scale-[0.98] pointer-events-none",
          "animate-[slideUp_0.45s_cubic-bezier(0.22,1,0.36,1)_both]"
        )}
        style={{
          animationDelay: `${Math.min(entry.rank * 60, 480)}ms`,
          // content-visibility tells the browser to skip painting cards
          // off-screen. Massive scroll-perf win with many cards in the list.
          contentVisibility: "auto",
          containIntrinsicSize: "0 180px",
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
              <BucketTag bucket={bucket} label={bucketLabel} />
              <CustomerSourceBadge
                source={customer.source ?? null}
                externalPolicyCount={customer.externalPolicyCount ?? 0}
              />
            </div>

            {/* Why now — single Hebrew sentence, no competing scores */}
            <p className="mt-2.5 text-sm font-normal text-surface-800 leading-snug">
              {whyTodayReason}
            </p>

            {/* "+N more topics" — no per-insight score badges on the queue card */}
            {supportingCount > 0 && (
              <p className="mt-1.5 text-xs text-surface-500">
                +{supportingCount} נושאים נוספים
              </p>
            )}
          </div>

          {/* Right column — actions only (the gauge + ⓘ are gone) */}
          <div className="flex shrink-0 flex-col items-end gap-2">

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

            {/* Primary insight — one sentence, no score badge */}
            {primaryInsight && (
              <div className="rounded-lg border border-white/60 bg-white/55 p-3 backdrop-blur-md">
                <p className="text-sm font-medium text-surface-900">
                  {primaryInsight.title}
                </p>
                {primaryInsight.summary && (
                  <p className="mt-1 text-xs text-surface-600">
                    {primaryInsight.summary}
                  </p>
                )}
                {/* Output contract: every insight shows its evidence basis.
                    Currently wired for Har HaBituach-derived insights; other
                    rule-based insights can surface their triggerHint here
                    in a future pass. */}
                <EvidenceLine evidenceJson={primaryInsight.evidenceJson} />
              </div>
            )}

            {/* Supporting topics — titles only, no scores, no checkboxes */}
            {supportingInsights && supportingInsights.length > 0 && (
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-surface-600">
                  נושאים נוספים
                </h4>
                <ul className="space-y-1.5">
                  {supportingInsights.map((s) => (
                    <li
                      key={s.id}
                      className="text-xs text-surface-700 before:me-2 before:text-surface-400 before:content-['•']"
                    >
                      {s.title}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Message composer — always targets the primary insight */}
            {primaryInsight && (
              <div className="rounded-lg border border-white/60 bg-white/55 p-4 backdrop-blur-md">
                <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-surface-600">
                  הודעה ללקוח
                </h4>
                <MessageComposer
                  insightId={primaryInsight.id}
                  customerName={fullName}
                />
              </div>
            )}

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
// Bucket tag — the single visible category on a queue card
// ============================================================

// ============================================================
// Evidence line — "מבוסס על..." row under an insight
// ============================================================
// Renders only when the insight carries a recognizable evidence payload.
// Today we recognize Har HaBituach-origin evidence; other sources can
// plug in by extending the shape check below.

function EvidenceLine({ evidenceJson }: { evidenceJson: unknown }) {
  if (!evidenceJson || typeof evidenceJson !== "object") return null;
  const e = evidenceJson as Record<string, unknown>;
  if (e.source !== "HAR_HABITUACH") return null;

  const count =
    typeof e.externalPoliciesCount === "number"
      ? e.externalPoliciesCount
      : null;
  const insurers = Array.isArray(e.insurers) ? (e.insurers as string[]) : null;
  const importedAt =
    typeof e.importedAt === "string" ? new Date(e.importedAt) : null;

  const insurerText =
    insurers && insurers.length > 0
      ? insurers.length === 1
        ? insurers[0]
        : `${insurers.length} חברות`
      : null;

  const dateText = importedAt
    ? importedAt.toLocaleDateString("he-IL")
    : null;

  return (
    <p className="mt-2 border-t border-surface-200/60 pt-2 text-[11px] text-surface-500 leading-snug">
      <span className="font-medium text-surface-600">מבוסס על: </span>
      {count != null && (
        <>
          <span className="number">{count}</span> פוליסות
        </>
      )}
      {insurerText && ` אצל ${insurerText}`}
      {dateText && ` · ייבוא הר הביטוח מתאריך ${dateText}`}
    </p>
  );
}

// ============================================================
// Customer source badge — flags external-data state
// ============================================================
// Three states:
//   - Office customer, no external data → no badge (cleanest default)
//   - Office customer with external data → "📂 פוטנציאל (N)" (violet, informational)
//   - Prospect from Har HaBituach, not in office book → "ללא תיק פעיל"
//     (amber, requires attention)

function CustomerSourceBadge({
  source,
  externalPolicyCount,
}: {
  source: string | null;
  externalPolicyCount: number;
}) {
  if (source === "HAR_HABITUACH_ONLY") {
    return (
      <span className="inline-flex items-center rounded-full border border-amber-300/60 bg-amber-50/70 px-2.5 py-0.5 text-[11px] font-medium text-amber-700 backdrop-blur-md">
        ללא תיק פעיל במשרד
      </span>
    );
  }
  if (externalPolicyCount > 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-violet-300/50 bg-violet-500/10 px-2.5 py-0.5 text-[11px] font-medium text-violet-700 backdrop-blur-md">
        <span aria-hidden>📂</span>
        <span>
          פוטנציאל{" "}
          <span className="number">({externalPolicyCount})</span>
        </span>
      </span>
    );
  }
  return null;
}

function BucketTag({ bucket, label }: { bucket: OfficeBucket; label: string }) {
  const tone =
    bucket === "coverage"
      ? "bg-indigo-500/12 text-indigo-700 border-indigo-300/50"
      : bucket === "savings"
        ? "bg-cyan-500/12 text-cyan-700 border-cyan-300/50"
        : bucket === "service"
          ? "bg-violet-500/12 text-violet-700 border-violet-300/50"
          : bucket === "renewal"
            ? "bg-amber-500/12 text-amber-700 border-amber-300/50"
            : "bg-rose-500/12 text-rose-700 border-rose-300/50";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium backdrop-blur-md",
        tone
      )}
    >
      {label}
    </span>
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

