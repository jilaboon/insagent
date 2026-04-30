"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DataFreshness,
  UrgencyIndicator,
  CompletenessIndicator,
} from "@/components/ui/indicators";
import { DataCoverageBanner } from "@/components/ui/data-coverage-banner";
import { CustomerNotes } from "@/components/customers/customer-notes";
import { ExecutiveIntelligencePanel } from "@/components/customers/executive-intelligence-panel";
import {
  BankingPlaceholderSection,
  DocumentsImportsSection,
  PensionProvidentSection,
} from "@/components/customers/customer-360-sections";
import {
  ScoreWithBreakdown,
  type ScoreBreakdown,
} from "@/components/shared/score-with-breakdown";
import { MessageComposer } from "@/components/shared/message-composer";
import { SkeletonCard, Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useCustomerDetail, useGenerateCombinedMessage, type CustomerDetail } from "@/lib/api/hooks";
import { formatCurrency, formatDate } from "@/lib/utils";
import { policyCategoryLabels, insightCategoryLabels } from "@/lib/constants";
import type { MessageDraftItem } from "@/lib/types/message";
import {
  User,
  MapPin,
  Shield,
  ShieldOff,
  Lightbulb,
  FileText,
  UserX,
  MessageSquare,
  Sparkles,
  X,
  Loader2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

// ============================================================
// Local types & helpers for Stage B (customer-detail UX)
// ============================================================

type CustomerInsight = {
  id: string;
  category: string;
  title: string;
  summary: string;
  whyNow: string | null;
  urgencyLevel: number;
  strengthScore: number;
  generatedBy: string;
  kind?: "commercial" | "service_tip" | null;
  scoreBreakdown?: ScoreBreakdown | null;
  messageDraft: {
    id: string;
    body: string;
    status: string;
  } | null;
};

/**
 * Treat any insight without an explicit `kind` as commercial — matches
 * the Stage A contract (default to opportunity so older payloads still
 * show up as actionable).
 */
function insightKind(
  insight: Pick<CustomerInsight, "kind">
): "commercial" | "service_tip" {
  return insight.kind === "service_tip" ? "service_tip" : "commercial";
}

// ============================================================
// Policy grouping helpers
// ============================================================

// Categories that bill monthly and use startDate as the primary date.
// (LIFE, HEALTH, PENSION, SAVINGS, RISK)
const MONTHLY_CATEGORIES = new Set([
  "LIFE",
  "HEALTH",
  "PENSION",
  "SAVINGS",
  "RISK",
]);

// Statuses that appear in the "needs attention" bucket and the
// human-readable Hebrew label for each.
const NEEDS_ATTENTION_STATUSES: Record<string, string> = {
  FROZEN: "מוקפאת",
  PAID_UP: "מסולקת",
  ARREARS: "בפיגור",
};

// Statuses that appear in the "inactive" bucket and the
// human-readable Hebrew label for each.
const INACTIVE_STATUSES: Record<string, string> = {
  CANCELLED: "מבוטל",
  EXPIRED: "פג תוקף",
};

type PolicyBucket = "active" | "attention" | "inactive";

function policyBucket(status: string): PolicyBucket {
  if (status in NEEDS_ATTENTION_STATUSES) return "attention";
  if (status in INACTIVE_STATUSES) return "inactive";
  // ACTIVE, PROPOSAL, UNKNOWN, and anything else fall into "active".
  return "active";
}

const STRONG_SCORE_THRESHOLD = 70;
const STRONG_SEGMENT_LIMIT = 2;

function splitInsights(insights: CustomerInsight[]) {
  const commercial = insights
    .filter((i) => insightKind(i) === "commercial")
    .sort((a, b) => b.strengthScore - a.strengthScore);

  const serviceTips = insights
    .filter((i) => insightKind(i) === "service_tip")
    .sort((a, b) => b.strengthScore - a.strengthScore);

  const strong: CustomerInsight[] = [];
  const moreCommercial: CustomerInsight[] = [];
  for (const item of commercial) {
    if (
      strong.length < STRONG_SEGMENT_LIMIT &&
      item.strengthScore >= STRONG_SCORE_THRESHOLD
    ) {
      strong.push(item);
    } else {
      moreCommercial.push(item);
    }
  }

  return { strong, moreCommercial, serviceTips };
}

export default function CustomerProfilePage() {
  const params = useParams<{ id: string }>();
  const { data: customer, isLoading, error } = useCustomerDetail(params.id);

  // All hooks must be called unconditionally before any early returns
  const [selectedInsightIds, setSelectedInsightIds] = useState<Set<string>>(new Set());
  const [combinedMessage, setCombinedMessage] = useState<MessageDraftItem | null>(null);
  const [showMoreInsights, setShowMoreInsights] = useState(false);
  const generateCombined = useGenerateCombinedMessage();

  if (isLoading) {
    return <CustomerProfileSkeleton />;
  }

  if (error || !customer) {
    return (
      <EmptyState
        icon={UserX}
        title="לקוח לא נמצא"
        description="הלקוח המבוקש לא נמצא במערכת. ייתכן שהנתונים טרם יובאו."
      />
    );
  }

  function toggleInsightSelection(id: string) {
    setSelectedInsightIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function clearSelection() {
    setSelectedInsightIds(new Set());
    setCombinedMessage(null);
  }

  async function handleGenerateCombined() {
    const ids = Array.from(selectedInsightIds);
    try {
      const result = await generateCombined.mutateAsync({ insightIds: ids });
      const raw = result as Record<string, unknown>;
      const draft: MessageDraftItem = {
        id: (raw.messageId || raw.id || "") as string,
        customerId: customer?.id ?? "",
        customerName: customer ? `${customer.firstName} ${customer.lastName}` : "",
        insightId: null,
        insightTitle: null,
        body: (raw.body || "") as string,
        tone: null,
        purpose: null,
        status: "DRAFT",
        generatedBy: "AI",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setCombinedMessage(draft);
    } catch {
      // Error handled by mutation
    }
  }

  // Calculate profile completeness based on available data
  const profileCompleteness: 0 | 1 | 2 = (() => {
    let score = 0;
    if (customer.address) score++;
    if (customer.phone) score++;
    if (customer.email) score++;
    if (customer.policies.length > 0) score++;
    if (customer.age || customer.dateOfBirth) score++;
    if (score >= 4) return 2;
    if (score >= 2) return 1;
    return 0;
  })();

  return (
    <div className="space-y-6 animate-[fadeIn_0.3s_ease-out_forwards]">
      {/* Data coverage banner */}
      <DataCoverageBanner
        fileCount={customer.importFileCount}
        lastUpdated={customer.lastImportDate}
      />

      {/* Customer header */}
      <Card>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-5">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-50 text-primary-700">
              <span className="text-lg font-bold">
                {customer.firstName[0]}
                {customer.lastName[0]}
              </span>
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold text-surface-900">
                  {customer.firstName} {customer.lastName}
                </h1>
                {typeof customer.tenure?.years === "number" && (
                  <span
                    className="inline-flex items-center gap-1 rounded-full border border-emerald-300/50 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700"
                    title="ותק לקוח אצלנו — לפי הפוליסה הוותיקה ביותר"
                  >
                    ותק{" "}
                    <span className="number">
                      {customer.tenure.years.toFixed(1)}
                    </span>{" "}
                    שנים
                  </span>
                )}
              </div>
              <div className="mt-1 flex items-center gap-4 text-sm text-surface-500">
                <span className="flex items-center gap-1 number">
                  <User className="h-3.5 w-3.5" />
                  ת.ז. {customer.israeliId}
                </span>
                {customer.address && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" />
                    {customer.address}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {customer.phone && (
              <span className="text-xs text-surface-500 number">{customer.phone}</span>
            )}
          </div>
        </div>
      </Card>

      {/* Executive Intelligence Panel — at-a-glance headline strip */}
      <ExecutiveIntelligencePanel customer={customer} />

      {/* Insurance map */}
      <Card>
        <CardHeader>
          <CardTitle>מפת הביטוח</CardTitle>
        </CardHeader>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-7">
          {(
            Object.entries(customer.insuranceMap) as [
              string,
              (typeof customer.insuranceMap)[string],
            ][]
          ).map(([key, cat]) => (
            <InsuranceMapCard
              key={key}
              label={policyCategoryLabels[key] || key}
              data={cat}
            />
          ))}
        </div>
      </Card>

      {/* Main content — two column */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left column (2/3) — Insights */}
        <div className="space-y-6 lg:col-span-2">
          {/* Insights */}
          <div id="insights-section" className="scroll-mt-6">
          <Card>
            <CardHeader>
              <CardTitle>
                <span className="flex items-center gap-2">
                  <Lightbulb className="h-4 w-4 text-accent-500" />
                  תובנות
                </span>
              </CardTitle>
              <Badge variant="muted">{customer.insights.length}</Badge>
            </CardHeader>
            {customer.insights.length > 0 ? (
              (() => {
                const { strong, moreCommercial, serviceTips } = splitInsights(
                  customer.insights as CustomerInsight[]
                );
                const hiddenCount = moreCommercial.length + serviceTips.length;
                const renderRow = (insight: CustomerInsight) => (
                  <div key={insight.id} className="flex items-start gap-3">
                    {/* Checkbox for multi-select */}
                    <label className="mt-4 flex shrink-0 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedInsightIds.has(insight.id)}
                        onChange={() => toggleInsightSelection(insight.id)}
                        className="h-4 w-4 rounded border-surface-300 text-primary-600 focus:ring-primary-500"
                      />
                    </label>
                    <div className="flex-1 min-w-0">
                      <InsightCard
                        insight={insight}
                        customerName={`${customer.firstName} ${customer.lastName}`}
                      />
                    </div>
                  </div>
                );

                return (
                  <div className="space-y-5">
                    {/* Segment 1 — Strong opportunities (always visible, max 2) */}
                    <section aria-labelledby="insights-strong-heading">
                      <h3
                        id="insights-strong-heading"
                        className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-emerald-700"
                      >
                        <span aria-hidden>💰</span>
                        <span>הזדמנויות חזקות</span>
                      </h3>
                      {strong.length > 0 ? (
                        <div className="space-y-3">{strong.map(renderRow)}</div>
                      ) : (
                        <p className="rounded-lg border border-dashed border-surface-200 bg-surface-50/50 px-4 py-3 text-xs text-surface-500">
                          אין הזדמנויות חזקות כרגע
                        </p>
                      )}
                    </section>

                    {/* Toggle — reveals segments 2 + 3 together */}
                    {hiddenCount > 0 && (
                      <div>
                        <button
                          type="button"
                          onClick={() => setShowMoreInsights((v) => !v)}
                          aria-expanded={showMoreInsights}
                          aria-controls="insights-more-region"
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-primary-700 hover:text-primary-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 rounded"
                        >
                          {showMoreInsights ? (
                            <>
                              <span>הסתר</span>
                              <ChevronUp className="h-3.5 w-3.5" />
                            </>
                          ) : (
                            <>
                              <span className="number">
                                הצג עוד {hiddenCount} נושאים
                              </span>
                              <ChevronDown className="h-3.5 w-3.5" />
                            </>
                          )}
                        </button>
                      </div>
                    )}

                    {showMoreInsights && (
                      <div
                        id="insights-more-region"
                        className="space-y-5 animate-[fadeIn_0.2s_ease-out_forwards]"
                      >
                        {/* Segment 2 — More commercial opportunities */}
                        {moreCommercial.length > 0 && (
                          <section aria-labelledby="insights-more-heading">
                            <h3
                              id="insights-more-heading"
                              className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-emerald-700/80"
                            >
                              <span aria-hidden>💰</span>
                              <span>הזדמנויות נוספות</span>
                              <span className="text-surface-400 number">
                                ({moreCommercial.length})
                              </span>
                            </h3>
                            <div className="space-y-3">
                              {moreCommercial.map(renderRow)}
                            </div>
                          </section>
                        )}

                        {/* Segment 3 — Service tips */}
                        {serviceTips.length > 0 && (
                          <section aria-labelledby="insights-service-heading">
                            <h3
                              id="insights-service-heading"
                              className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-cyan-700"
                            >
                              <span aria-hidden>🤝</span>
                              <span>טיפי שירות מותאמים</span>
                              <span className="text-surface-400 number">
                                ({serviceTips.length})
                              </span>
                            </h3>
                            <div className="space-y-3">
                              {serviceTips.map(renderRow)}
                            </div>
                          </section>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()
            ) : (
              <p className="py-6 text-center text-sm text-surface-400">
                אין תובנות עדיין — יש להריץ ניתוח
              </p>
            )}

            {/* Combined message result */}
            {combinedMessage && (
              <div className="mt-4 border-t border-surface-100 pt-4">
                <MessageComposer
                  insightId={combinedMessage.insightId ?? ""}
                  customerName={`${customer.firstName} ${customer.lastName}`}
                  existingMessage={combinedMessage}
                />
              </div>
            )}
          </Card>
          </div>

          {/* Conversation journal — placed under insights so the agent
              sees commercial opportunities first, then picks up context
              from prior conversations. */}
          <CustomerNotes customerId={customer.id} />

          {/* Floating action bar for combined message */}
          {selectedInsightIds.size >= 2 && (
            <div className="sticky bottom-4 z-20">
              <div className="flex items-center justify-between rounded-xl border border-primary-200 bg-white px-5 py-3 shadow-lg">
                <span className="text-sm font-medium text-surface-700">
                  {selectedInsightIds.size} תובנות נבחרו
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearSelection}
                  >
                    <X className="h-3.5 w-3.5" />
                    בטל בחירה
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleGenerateCombined}
                    disabled={generateCombined.isPending}
                    className="bg-gradient-to-l from-indigo-600 to-primary-600 hover:from-indigo-700 hover:to-primary-700"
                  >
                    {generateCombined.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5" />
                    )}
                    {generateCombined.isPending ? "יוצר הודעה..." : "צור הודעה משולבת"}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Message Drafts */}
          {customer.messageDrafts.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>
                  <span className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-emerald-500" />
                    טיוטות הודעות
                  </span>
                </CardTitle>
                <Badge variant="muted">{customer.messageDrafts.length}</Badge>
              </CardHeader>
              <div className="space-y-3">
                {customer.messageDrafts.map((draft) => (
                  <div
                    key={draft.id}
                    className="rounded-lg border border-surface-100 p-4"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <MessageStatusBadge status={draft.status} />
                      <span className="text-xs text-surface-400">
                        {formatDate(draft.createdAt)}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm text-surface-700">
                      {draft.body}
                    </p>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        {/* Right column (1/3) — Policies */}
        <div className="space-y-6">
          {/* Policies summary — grouped into three buckets so the agent
              can immediately see what's live, what needs attention, and
              what's history. External (Har HaBituach) policies still
              sort to the top within each bucket. */}
          <Card>
            <CardHeader>
              <CardTitle>פוליסות</CardTitle>
              <div className="flex items-center gap-2">
                {(() => {
                  const buckets = customer.policies.reduce(
                    (acc, p) => {
                      acc[policyBucket(p.status)]++;
                      return acc;
                    },
                    { active: 0, attention: 0, inactive: 0 } as Record<
                      PolicyBucket,
                      number
                    >
                  );
                  const liveCount = buckets.active + buckets.attention;
                  return (
                    <>
                      <Badge variant="muted">
                        <span className="number">{liveCount}</span>
                      </Badge>
                      {buckets.inactive > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-surface-200 bg-surface-50 px-2 py-0.5 text-[11px] font-medium text-surface-500">
                          <span className="number">{buckets.inactive}</span>
                          <span>לא פעילות</span>
                        </span>
                      )}
                    </>
                  );
                })()}
                {(() => {
                  const externalCount = customer.policies.filter(
                    (p) => p.externalSource === "HAR_HABITUACH"
                  ).length;
                  if (externalCount === 0) return null;
                  return (
                    <span className="inline-flex items-center gap-1 rounded-full border border-violet-300/50 bg-violet-500/10 px-2 py-0.5 text-[11px] font-medium text-violet-700">
                      <span aria-hidden>📂</span>
                      <span className="number">{externalCount}</span>
                      <span>מחוץ למשרד</span>
                    </span>
                  );
                })()}
              </div>
            </CardHeader>
            {customer.policies.length > 0 ? (
              (() => {
                // Sort comparator: external (Har HaBituach) first within
                // each bucket, then preserve original order.
                const externalFirst = (
                  a: (typeof customer.policies)[number],
                  b: (typeof customer.policies)[number]
                ) => {
                  const ax = a.externalSource === "HAR_HABITUACH" ? 0 : 1;
                  const bx = b.externalSource === "HAR_HABITUACH" ? 0 : 1;
                  return ax - bx;
                };

                const grouped = {
                  active: [...customer.policies]
                    .filter((p) => policyBucket(p.status) === "active")
                    .sort(externalFirst),
                  attention: [...customer.policies]
                    .filter((p) => policyBucket(p.status) === "attention")
                    .sort(externalFirst),
                  inactive: [...customer.policies]
                    .filter((p) => policyBucket(p.status) === "inactive")
                    .sort(externalFirst),
                };

                // History per policy = other office policies of the
                // same insurer + category + subType, sorted oldest →
                // newest. Heuristic but covers the typical renewal
                // pattern (annual renewals get fresh policy records).
                const historyKey = (p: typeof customer.policies[number]) =>
                  `${p.insurer}|${p.category}|${p.subType ?? ""}`;
                const officePolicies = customer.policies.filter(
                  (p) => p.externalSource !== "HAR_HABITUACH"
                );
                const historyByPolicyId: Record<string, typeof customer.policies> =
                  {};
                for (const p of officePolicies) {
                  const k = historyKey(p);
                  historyByPolicyId[p.id] = officePolicies
                    .filter((q) => q.id !== p.id && historyKey(q) === k)
                    .sort((a, b) => {
                      const ad = a.startDate
                        ? new Date(a.startDate).getTime()
                        : 0;
                      const bd = b.startDate
                        ? new Date(b.startDate).getTime()
                        : 0;
                      return ad - bd;
                    });
                }

                return (
                  <div className="space-y-5">
                    {/* Bucket 1 — Active */}
                    {grouped.active.length > 0 && (
                      <section aria-labelledby="policies-active-heading">
                        <h3
                          id="policies-active-heading"
                          className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-emerald-700"
                        >
                          <span>פעילות</span>
                          <span className="text-surface-400 number">
                            ({grouped.active.length})
                          </span>
                        </h3>
                        <div className="space-y-3">
                          {grouped.active.map((policy) => (
                            <PolicyRow
                              key={policy.id}
                              policy={policy}
                              tone="active"
                              history={historyByPolicyId[policy.id] ?? []}
                            />
                          ))}
                        </div>
                      </section>
                    )}

                    {/* Bucket 2 — Needs attention */}
                    {grouped.attention.length > 0 && (
                      <section aria-labelledby="policies-attention-heading">
                        <h3
                          id="policies-attention-heading"
                          className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-amber-800"
                        >
                          <span>דורשות התייחסות</span>
                          <span className="text-surface-400 number">
                            ({grouped.attention.length})
                          </span>
                        </h3>
                        <div className="space-y-3">
                          {grouped.attention.map((policy) => (
                            <PolicyRow
                              key={policy.id}
                              policy={policy}
                              tone="attention"
                              history={historyByPolicyId[policy.id] ?? []}
                            />
                          ))}
                        </div>
                      </section>
                    )}

                    {/* Bucket 3 — Inactive */}
                    {grouped.inactive.length > 0 && (
                      <section aria-labelledby="policies-inactive-heading">
                        <h3
                          id="policies-inactive-heading"
                          className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-surface-500"
                        >
                          <span>פוליסות לא פעילות</span>
                          <span className="text-surface-400 number">
                            ({grouped.inactive.length})
                          </span>
                        </h3>
                        <div className="space-y-3">
                          {grouped.inactive.map((policy) => (
                            <PolicyRow
                              key={policy.id}
                              policy={policy}
                              tone="inactive"
                              history={historyByPolicyId[policy.id] ?? []}
                            />
                          ))}
                        </div>
                      </section>
                    )}
                  </div>
                );
              })()
            ) : (
              <p className="py-6 text-center text-sm text-surface-400">
                לא נמצאו פוליסות
              </p>
            )}
          </Card>

          <CustomerJourneyCard tenure={customer.tenure} />
        </div>
      </div>

      {/* Phase 2 sections — sit beneath the two-column grid as full-width
          siblings. Order matters: institutional products first (the
          richest signal), then the import timeline that explains where
          the data came from, then the banking placeholder which sets
          expectations for Phase 4. */}
      <PensionProvidentSection products={customer.financialProducts} />
      <DocumentsImportsSection imports={customer.imports} />
      <BankingPlaceholderSection />
    </div>
  );
}

// ============================================================
// Customer Journey Card — explains the tenure number visually.
// Lists every office policy on a chronological track so the agent
// can see "this is when you started, and these are all the renewals
// since". Har HaBituach rows are excluded — they're not the office's
// relationship.
// ============================================================
const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "פעיל",
  PROPOSAL: "הצעה",
  UNKNOWN: "לא ידוע",
  CANCELLED: "מבוטל",
  EXPIRED: "פג תוקף",
  FROZEN: "מוקפאת",
  PAID_UP: "מסולקת",
  ARREARS: "בפיגור",
};

function statusTone(
  status: string
): { dot: string; text: string; track: string } {
  if (status === "ACTIVE" || status === "PROPOSAL" || status === "UNKNOWN") {
    return {
      dot: "bg-emerald-500",
      text: "text-emerald-700",
      track: "bg-emerald-400/30",
    };
  }
  if (status === "CANCELLED" || status === "EXPIRED") {
    return {
      dot: "bg-rose-400",
      text: "text-rose-600",
      track: "bg-rose-300/30",
    };
  }
  return {
    dot: "bg-amber-500",
    text: "text-amber-700",
    track: "bg-amber-400/30",
  };
}

function formatYearMonth(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("he-IL", { year: "numeric", month: "2-digit" });
}

function CustomerJourneyCard({
  tenure,
}: {
  tenure: CustomerDetail["tenure"];
}) {
  if (typeof tenure?.years !== "number") return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>מסע הלקוח אצלנו</CardTitle>
      </CardHeader>
      <div className="rounded-lg border border-emerald-200/70 bg-emerald-50/50 p-3">
        <p className="text-xs text-emerald-800">
          ותק במשרד —{" "}
          <span className="font-bold number">
            {tenure.years.toFixed(1)}
          </span>{" "}
          שנים, מחושב מתאריך התחלת הפוליסה הוותיקה ביותר אצלנו
          (כולל מבוטלות ופגות תוקף, לא כולל הר הביטוח).
        </p>
        {tenure.oldestStartDate && (
          <p className="mt-1 text-[11px] text-emerald-700/80">
            פוליסה ראשונה התחילה ב־
            <span className="number">
              {formatYearMonth(tenure.oldestStartDate)}
            </span>
            . לראות את ההיסטוריה של פוליסה ספציפית — לחץ על
            &ldquo;צפה בהיסטוריה&rdquo; בכל כרטיס פוליסה למעלה.
          </p>
        )}
      </div>
    </Card>
  );
}

// ============================================================
// Insurance Map Card
// ============================================================

function InsuranceMapCard({
  label,
  data,
}: {
  label: string;
  data: {
    exists: boolean;
    dataFreshness: string | null;
    policyCount?: number;
    totalAnnualPremium?: number;
    totalMonthlyPremium?: number;
    totalAccumulated?: number;
    insurers?: string[];
    nearestExpiry?: string | null;
  };
}) {
  if (!data.exists) {
    // Gap state — muted, dashed. Lets the ambient field show through.
    return (
      <div className="flex flex-col items-center rounded-[14px] border border-dashed border-white/70 bg-white/25 p-4 text-center backdrop-blur-sm">
        <ShieldOff className="mb-2 h-5 w-5 text-surface-400" />
        <p className="text-xs font-medium text-surface-500">{label}</p>
        <p className="mt-1 text-[10px] text-surface-500">
          לא זוהה בנתונים שנקלטו
        </p>
      </div>
    );
  }

  // Covered state — chromatic glow + neon shield, the iconic grid element.
  return (
    <div
      className="relative flex flex-col overflow-hidden rounded-[14px] border border-white/70 bg-white/70 p-4 text-center backdrop-blur-md"
      style={{
        boxShadow:
          "0 1px 0 rgba(255,255,255,0.9) inset, " +
          "0 6px 18px -8px rgba(80,70,180,0.18)",
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(80% 60% at 50% 0%, rgba(167,139,250,0.2), transparent 70%)",
        }}
      />
      <div className="relative">
        <span className="relative mx-auto mb-2 inline-grid h-8 w-8 place-items-center">
          <span
            aria-hidden
            className="absolute -inset-1 rounded-full"
            style={{
              background:
                "conic-gradient(from 0deg, rgba(240,171,252,0.5), rgba(129,140,248,0.5), rgba(34,211,238,0.45), rgba(167,139,250,0.5), rgba(240,171,252,0.5))",
              filter: "blur(6px)",
              opacity: 0.7,
            }}
          />
          <Shield
            className="relative h-5 w-5 text-violet-600"
            style={{ filter: "drop-shadow(0 0 3px rgba(167,139,250,0.6))" }}
          />
        </span>
        <p className="text-xs font-semibold text-surface-900">{label}</p>
        {data.policyCount != null && data.policyCount > 0 && (
          <p className="mt-1 text-[10px] text-surface-600 number">
            {data.policyCount} פוליסות
          </p>
        )}
        {data.totalAnnualPremium != null && data.totalAnnualPremium > 0 && (
          <p className="mt-0.5 text-xs font-medium text-surface-800 number">
            {formatCurrency(data.totalAnnualPremium)}/שנה
          </p>
        )}
        {data.totalAccumulated != null && data.totalAccumulated > 0 && (
          <p className="mt-0.5 text-xs font-medium text-surface-800 number">
            {formatCurrency(data.totalAccumulated)}
          </p>
        )}
        {data.dataFreshness && (
          <div className="mt-2">
            <DataFreshness date={data.dataFreshness} />
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Insight Card with MessageComposer
// ============================================================

function InsightCard({
  insight,
  customerName,
}: {
  insight: CustomerInsight;
  customerName: string;
}) {
  const [showComposer, setShowComposer] = useState(false);
  const kind = insightKind(insight);

  return (
    <div className="rounded-lg border border-surface-100 p-4">
      <div className="mb-2 flex items-start justify-between">
        <div className="flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-medium text-surface-900">
              {insight.title}
            </h4>
            <InsightKindBadge kind={kind} />
            <ScoreWithBreakdown
              score={insight.strengthScore}
              title={insight.title}
              breakdown={insight.scoreBreakdown ?? null}
            />
          </div>
          <p className="text-sm text-surface-600">{insight.summary}</p>
        </div>
        <UrgencyIndicator level={insight.urgencyLevel as 0 | 1 | 2} />
      </div>
      <div className="mt-2 flex items-center justify-between">
        <div className="flex items-center gap-3 text-xs text-surface-400">
          {insight.whyNow && <span>{insight.whyNow}</span>}
          <Badge variant="muted">
            {insightCategoryLabels[
              insight.category as keyof typeof insightCategoryLabels
            ] || insight.category}
          </Badge>
          <Badge variant="muted">
            {insight.generatedBy === "DETERMINISTIC"
              ? "נתון מחושב"
              : "הערכת המערכת"}
          </Badge>
        </div>
        {!showComposer && !insight.messageDraft && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowComposer(true)}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            צור הודעה
          </Button>
        )}
      </div>
      {(showComposer || insight.messageDraft) && (
        <div className="mt-3 border-t border-surface-100 pt-3">
          <MessageComposer
            insightId={insight.id}
            customerName={customerName}
            existingMessage={
              insight.messageDraft
                ? {
                    id: insight.messageDraft.id,
                    customerId: "",
                    customerName,
                    insightId: insight.id,
                    insightTitle: insight.title,
                    body: insight.messageDraft.body,
                    tone: null,
                    purpose: null,
                    status: insight.messageDraft.status as
                      | "DRAFT"
                      | "APPROVED"
                      | "SENT"
                      | "SKIPPED",
                    generatedBy: "AI",
                    createdAt: "",
                    updatedAt: "",
                  }
                : undefined
            }
          />
        </div>
      )}
    </div>
  );
}

// ============================================================
// Policy Row — renders a single policy with the right styling per
// bucket (active / attention / inactive), correct premium periodicity
// per category, and the right primary date per category.
// ============================================================

type PolicyForRow = {
  id: string;
  policyNumber: string;
  insurer: string;
  category: string;
  subType: string | null;
  status: string;
  startDate: string | null;
  endDate: string | null;
  premiumMonthly: number | null;
  premiumAnnual: number | null;
  accumulatedSavings: number | null;
  dataFreshness: string | null;
  externalSource: string | null;
  harHabituachLastSeenAt: string | null;
};

function PolicyRow({
  policy,
  tone,
  history,
}: {
  policy: PolicyForRow;
  tone: "active" | "attention" | "inactive";
  history: PolicyForRow[];
}) {
  const [showHistory, setShowHistory] = useState(false);
  const isExternal = policy.externalSource === "HAR_HABITUACH";
  const isMonthlyCategory = MONTHLY_CATEGORIES.has(policy.category);

  // Collapse history to one entry per renewal year. Insurance renews
  // yearly, so showing every BAFI record (which can have multiple
  // entries per year for the same policy) is noise. The earliest
  // record in each year is the representative; duplicates surface as
  // a count beside it.
  const yearlyHistory = (() => {
    const byYear = new Map<
      number,
      { policy: PolicyForRow; count: number }
    >();
    for (const h of history) {
      if (!h.startDate) continue;
      const year = new Date(h.startDate).getFullYear();
      const existing = byYear.get(year);
      if (!existing) {
        byYear.set(year, { policy: h, count: 1 });
        continue;
      }
      existing.count += 1;
      const existingStart = new Date(existing.policy.startDate!).getTime();
      const newStart = new Date(h.startDate).getTime();
      if (newStart < existingStart) existing.policy = h;
    }
    return Array.from(byYear.values()).sort((a, b) => {
      const ay = new Date(a.policy.startDate!).getFullYear();
      const by = new Date(b.policy.startDate!).getFullYear();
      return ay - by;
    });
  })();

  // Container classes drive the visual differentiation between buckets.
  // External policies keep their violet treatment, but we still apply
  // the bucket's left-border accent + opacity so the grouping reads
  // even on Har-HaBituach rows.
  const containerClass = (() => {
    const base =
      "flex flex-wrap items-start justify-between gap-4 rounded-lg p-4 border-r-4";
    if (tone === "attention") {
      return cn(
        base,
        isExternal
          ? "border border-violet-300/50 bg-violet-500/5 border-r-amber-400"
          : "border border-surface-100 border-r-amber-400 bg-amber-50/30"
      );
    }
    if (tone === "inactive") {
      return cn(
        base,
        "opacity-50",
        isExternal
          ? "border border-violet-300/50 bg-violet-500/5 border-r-rose-400"
          : "border border-surface-100 border-r-rose-300 bg-rose-50/20"
      );
    }
    // active
    return cn(
      base,
      isExternal
        ? "border border-violet-300/50 bg-violet-500/5 border-r-violet-400"
        : "border border-surface-100 border-r-transparent"
    );
  })();

  // Status badge for non-active buckets — short Hebrew label only,
  // no Hebrew/English mixing.
  const statusLabel =
    NEEDS_ATTENTION_STATUSES[policy.status] ??
    INACTIVE_STATUSES[policy.status] ??
    null;

  // Premium display — monthly for life/health-style, annual for elementary.
  const renderPremium = () => {
    if (isMonthlyCategory) {
      const monthly =
        policy.premiumMonthly ??
        (policy.premiumAnnual != null
          ? Math.round(policy.premiumAnnual / 12)
          : null);
      if (monthly != null) {
        return (
          <p className="text-sm font-medium text-surface-800 number">
            {formatCurrency(monthly)}
            <span className="text-xs text-surface-400"> /חודש</span>
          </p>
        );
      }
    } else {
      const annual =
        policy.premiumAnnual ??
        (policy.premiumMonthly != null ? policy.premiumMonthly * 12 : null);
      if (annual != null) {
        return (
          <p className="text-sm font-medium text-surface-800 number">
            {formatCurrency(annual)}
            <span className="text-xs text-surface-400"> /שנה</span>
          </p>
        );
      }
    }
    if (policy.accumulatedSavings != null) {
      return (
        <p className="text-sm font-medium text-surface-800 number">
          {formatCurrency(policy.accumulatedSavings)}
        </p>
      );
    }
    return <p className="text-xs text-surface-400">₪0</p>;
  };

  return (
    <div className={containerClass}>
      <div className="flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium text-surface-800">
            {policy.subType || policy.category}
          </p>
          {isExternal && (
            <span className="inline-flex items-center gap-1 rounded-full border border-violet-300/60 bg-violet-500/15 px-2 py-0.5 text-[10px] font-medium text-violet-700">
              <span aria-hidden>📂</span>
              <span>מחוץ למשרד</span>
            </span>
          )}
          {statusLabel && tone === "attention" && (
            <span className="inline-flex items-center rounded-full border border-amber-300/60 bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-800">
              {statusLabel}
            </span>
          )}
          {statusLabel && tone === "inactive" && (
            <span className="inline-flex items-center rounded-full border border-rose-300/60 bg-rose-500/10 px-2 py-0.5 text-[10px] font-medium text-rose-700">
              {statusLabel}
            </span>
          )}
          {isExternal && <ExternalExpiryTag endDate={policy.endDate} />}
        </div>
        <div className="flex flex-wrap items-center gap-x-2 text-xs text-surface-500">
          <span>{policy.insurer}</span>
          <span className="number">{policy.policyNumber}</span>
          {!isExternal && yearlyHistory.length > 0 && (
            <button
              type="button"
              onClick={() => setShowHistory((v) => !v)}
              className="inline-flex items-center gap-1 rounded-md border border-surface-200 bg-white/60 px-1.5 py-0.5 text-[11px] font-medium text-surface-600 hover:border-violet-300 hover:text-violet-700"
              aria-expanded={showHistory}
              title="היסטוריית חידושים"
            >
              <ChevronDown
                className={cn(
                  "h-3 w-3 transition-transform",
                  showHistory && "rotate-180"
                )}
              />
              <span className="number">{yearlyHistory.length}</span>{" "}
              חידושים
            </button>
          )}
        </div>
        {/* Primary date — start date for life/health-style policies. */}
        {isMonthlyCategory && policy.startDate && (
          <p className="text-[11px] text-surface-600 number">
            תחילת ביטוח:{" "}
            {new Date(policy.startDate).toLocaleDateString("he-IL")}
          </p>
        )}
        {/* External-only secondary line: full coverage window. */}
        {isExternal && policy.startDate && policy.endDate && (
          <p className="text-[11px] text-violet-700/80 number">
            תקופת ביטוח:{" "}
            {new Date(policy.startDate).toLocaleDateString("he-IL")}
            {" – "}
            {new Date(policy.endDate).toLocaleDateString("he-IL")}
          </p>
        )}
        {isExternal && policy.harHabituachLastSeenAt && (
          <p className="text-[11px] text-violet-700/70">
            זוהה בהר הביטוח{" "}
            {new Date(policy.harHabituachLastSeenAt).toLocaleDateString(
              "he-IL"
            )}
          </p>
        )}
      </div>
      <div className="text-left">
        {renderPremium()}
        <DataFreshness date={policy.dataFreshness} />
      </div>

      {!isExternal && showHistory && yearlyHistory.length > 0 && (
        <div className="basis-full border-t border-surface-100 pt-3">
          <p className="mb-2 text-[11px] text-surface-500">
            חידושים שנתיים — כל ערך מייצג שנת חידוש אחת. אם BAFI שמרה
            כמה רשומות לאותה שנה (פוליסות מקבילות, או החלפת פוליסה
            אצל אותה חברה באמצע שנה) מוצגת ספירה לצידה.
          </p>
          <ul className="space-y-1.5">
            {yearlyHistory.map((entry) => {
              const tone = statusTone(entry.policy.status);
              const year = entry.policy.startDate
                ? new Date(entry.policy.startDate).getFullYear()
                : null;
              return (
                <li
                  key={entry.policy.id}
                  className="flex items-center gap-3 rounded-md border border-surface-100 bg-white/50 px-3 py-1.5"
                >
                  <span
                    className={cn(
                      "h-2 w-2 shrink-0 rounded-full",
                      tone.dot
                    )}
                    aria-hidden
                  />
                  <span className="number text-sm font-semibold text-surface-800">
                    {year ?? "—"}
                  </span>
                  <span className={cn("text-[11px] font-medium", tone.text)}>
                    {STATUS_LABELS[entry.policy.status] ?? entry.policy.status}
                  </span>
                  {entry.count > 1 && (
                    <span className="text-[11px] text-surface-500 number">
                      (×{entry.count})
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

// ============================================================
// External Expiry Tag — surfaces the timing window on Har
// HaBituach policies. Coarse tiers match the signal strength
// an agent cares about: act-now / warn / inform / overdue.
// ============================================================

function ExternalExpiryTag({ endDate }: { endDate: string | null }) {
  if (!endDate) return null;

  // Compute whole-day delta in local time. Using UTC ms would shift
  // results across time zones near midnight — Rafi ships in IL only,
  // but using local midnight keeps "today = 0 days" correct.
  const end = new Date(endDate);
  if (Number.isNaN(end.getTime())) return null;

  const today = new Date();
  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const msPerDay = 1000 * 60 * 60 * 24;
  const days = Math.round((startOfDay(end) - startOfDay(today)) / msPerDay);

  if (days < 0) {
    const overdue = Math.abs(days);
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-red-300/60 bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-700">
        <span className="number">פגה לפני {overdue} יום</span>
      </span>
    );
  }

  if (days <= 30) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-red-400/70 bg-red-500/15 px-2 py-0.5 text-[10px] font-semibold text-red-700">
        <span aria-hidden>🔥</span>
        <span className="number">מסתיימת תוך {days} יום</span>
      </span>
    );
  }

  if (days <= 90) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/60 bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-800">
        <span className="number">מסתיים בעוד {days} ימים</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-surface-200 bg-surface-50 px-2 py-0.5 text-[10px] font-medium text-surface-600">
      <span className="number">מסתיים בעוד {days} ימים</span>
    </span>
  );
}

// ============================================================
// Insight Kind Badge — small inline pill distinguishing commercial
// opportunities from service tips at a glance.
// ============================================================

function InsightKindBadge({
  kind,
}: {
  kind: "commercial" | "service_tip";
}) {
  if (kind === "service_tip") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-cyan-300/60 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-medium text-cyan-700">
        <span aria-hidden>🤝</span>
        <span>טיפ שירות</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300/60 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
      <span aria-hidden>💰</span>
      <span>הזדמנות</span>
    </span>
  );
}

// ============================================================
// Message Status Badge
// ============================================================

function MessageStatusBadge({ status }: { status: string }) {
  const config: Record<
    string,
    { label: string; variant: "success" | "warning" | "info" | "muted" }
  > = {
    DRAFT: { label: "טיוטה", variant: "warning" },
    APPROVED: { label: "מאושר", variant: "success" },
    SENT: { label: "נשלח", variant: "info" },
    SKIPPED: { label: "דולג", variant: "muted" },
  };

  const c = config[status] || { label: status, variant: "muted" as const };

  return <Badge variant={c.variant}>{c.label}</Badge>;
}

// ============================================================
// Loading Skeleton
// ============================================================

function CustomerProfileSkeleton() {
  return (
    <div className="space-y-6 animate-[fadeIn_0.3s_ease-out_forwards]">
      <Skeleton className="h-10 w-full rounded-lg" />
      <SkeletonCard />
      <SkeletonCard />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <SkeletonCard />
        </div>
        <div className="space-y-6">
          <SkeletonCard />
        </div>
      </div>
    </div>
  );
}
