"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import {
  ArrowRight,
  Target,
  Loader2,
  Users,
  Check,
  X,
  ExternalLink,
  Phone,
  Sparkles,
  FolderOpen,
  UserX,
  AlertCircle,
} from "lucide-react";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ui/progress-bar";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ScoreWithBreakdown,
  type ScoreBreakdown,
} from "@/components/shared/score-with-breakdown";

// ============================================================
// Types — mirrors the shape returned by GET /api/rules/[id]/session
// ============================================================

type InsightStatus =
  | "NEW"
  | "REVIEWED"
  | "DISMISSED"
  | "CONVERTED_TO_RECOMMENDATION"
  | "CONVERTED_TO_TASK";

interface SessionCustomer {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  israeliId: string;
  phone: string | null;
  email: string | null;
  age: number | null;
  source: string | null;
  externalPolicyCount: number;
  tenureYears: number | null;
}

interface TriggeringPolicy {
  id: string;
  policyNumber: string;
  insurer: string;
  // ISO string from the API; may be null when the source policy has no
  // recorded start date.
  startDate: string | null;
  premiumMonthly: number | null;
  premiumAnnual: number | null;
  // Prisma PolicyCategory enum, surfaced as a string. We use this to
  // pick monthly vs annual periodicity in the UI.
  category: string;
  status: string;
}

interface SessionItem {
  insightId: string;
  status: InsightStatus;
  strengthScore: number;
  insightTitle: string;
  insightSummary: string;
  whyNow: string | null;
  customer: SessionCustomer;
  // Optional: older insights generated before the breakdown / matched-
  // policies fields were added won't carry these. The UI degrades to
  // the plain badge / hides the section.
  scoreBreakdown: ScoreBreakdown | null;
  triggeringPolicies: TriggeringPolicy[];
}

// ============================================================
// Premium periodicity by category — same convention used on the
// customer detail card. LIFE/HEALTH/PENSION/SAVINGS/RISK bill monthly
// (we display monthly), PROPERTY/VEHICLE/BUSINESS bill annually (we
// display annual). When only the "wrong" side of the pair is
// populated we synthesize the other (annual = monthly * 12, etc.).
// ============================================================
const MONTHLY_CATEGORIES = new Set([
  "LIFE",
  "HEALTH",
  "PENSION",
  "SAVINGS",
  "RISK",
]);

function premiumDisplay(p: TriggeringPolicy): {
  amount: number | null;
  suffix: string;
} {
  if (MONTHLY_CATEGORIES.has(p.category)) {
    const amount =
      p.premiumMonthly ??
      (p.premiumAnnual != null ? p.premiumAnnual / 12 : null);
    return { amount, suffix: "לחודש" };
  }
  const amount =
    p.premiumAnnual ??
    (p.premiumMonthly != null ? p.premiumMonthly * 12 : null);
  return { amount, suffix: "לשנה" };
}

interface SessionRule {
  id: string;
  title: string;
  body: string;
  category: string | null;
  kind: string | null;
  baseStrength: number | null;
  triggerHint: string | null;
  triggerCondition: string | null;
  isActive: boolean;
}

interface SessionPagination {
  offset: number;
  limit: number;
  returned: number;
  total: number;
  hasMore: boolean;
  nextOffset: number | null;
}

interface SessionResponse {
  rule: SessionRule;
  stats: { total: number; open: number; handled: number };
  items: SessionItem[];
  pagination: SessionPagination;
}

const PAGE_SIZE = 50;

const categoryVariant: Record<
  string,
  "primary" | "success" | "warning" | "info" | "default"
> = {
  חידוש: "warning",
  כיסוי: "primary",
  חיסכון: "success",
  שירות: "info",
  כללי: "default",
};

// ============================================================
// Data helpers
// ============================================================

async function fetchSession(
  ruleId: string,
  offset: number,
  limit: number
): Promise<SessionResponse> {
  const res = await fetch(
    `/api/rules/${ruleId}/session?offset=${offset}&limit=${limit}`
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `טעינת הסשן נכשלה (${res.status})`);
  }
  return res.json();
}

async function patchInsight(params: {
  id: string;
  status: "REVIEWED" | "DISMISSED" | "NEW";
}) {
  const res = await fetch(`/api/insights/${params.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: params.status }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `עדכון התובנה נכשל (${res.status})`);
  }
  return res.json();
}

// ============================================================
// Sort options
// ============================================================

type SortKey =
  | "strength"
  | "lastName"
  | "age"
  | "externalPolicies"
  | "premium"
  | "status";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "strength", label: "חוזק" },
  { value: "premium", label: "פרמיה שעונה על החוק" },
  { value: "lastName", label: "שם משפחה" },
  { value: "age", label: "גיל" },
  { value: "externalPolicies", label: "פוליסות חיצוניות 📂" },
  { value: "status", label: "סטטוס" },
];

type ExternalFilter = "all" | "only" | "without";

const EXTERNAL_FILTER_OPTIONS: { value: ExternalFilter; label: string }[] = [
  { value: "all", label: "כולל הר הביטוח" },
  { value: "only", label: "רק עם הר הביטוח" },
  { value: "without", label: "בלי הר הביטוח" },
];

/**
 * Total monthly premium across the policies that triggered this rule
 * for this customer. Annual premiums are folded in as /12. Returns
 * null when there are no triggering policies — those rows sort to the
 * bottom.
 */
function triggeringMonthlyPremium(item: SessionItem): number | null {
  const policies = item.triggeringPolicies ?? [];
  if (policies.length === 0) return null;
  let total = 0;
  let any = false;
  for (const p of policies) {
    const monthly =
      (p.premiumMonthly ?? null) !== null
        ? (p.premiumMonthly as number)
        : p.premiumAnnual != null
          ? p.premiumAnnual / 12
          : null;
    if (monthly != null) {
      total += monthly;
      any = true;
    }
  }
  return any ? total : null;
}

/**
 * Compare two items by the selected primary sort key. Returns the
 * usual -1/0/1 sign. NULL values are pushed to the end (positive sign)
 * regardless of direction so unknown ages / missing fields don't crowd
 * the top of the list.
 */
function comparePrimary(a: SessionItem, b: SessionItem, key: SortKey): number {
  switch (key) {
    case "strength": {
      // Higher first
      return (b.strengthScore ?? 0) - (a.strengthScore ?? 0);
    }
    case "lastName": {
      const al = a.customer.lastName ?? "";
      const bl = b.customer.lastName ?? "";
      if (!al && !bl) return 0;
      if (!al) return 1;
      if (!bl) return -1;
      return al.localeCompare(bl, "he");
    }
    case "age": {
      const aa = a.customer.age;
      const ba = b.customer.age;
      if (aa == null && ba == null) return 0;
      if (aa == null) return 1;
      if (ba == null) return -1;
      // Older first
      return ba - aa;
    }
    case "externalPolicies": {
      // Higher first — externalPolicyCount is always a number (0+),
      // so no null handling needed here.
      return b.customer.externalPolicyCount - a.customer.externalPolicyCount;
    }
    case "premium": {
      // Higher monthly premium first. Customers without triggering
      // policy data (older insights) drop to the bottom.
      const ap = triggeringMonthlyPremium(a);
      const bp = triggeringMonthlyPremium(b);
      if (ap == null && bp == null) return 0;
      if (ap == null) return 1;
      if (bp == null) return -1;
      return bp - ap;
    }
    case "status": {
      // Open first is the primary intent of this sort; secondary by
      // strength desc keeps the top of each group meaningful.
      const ao = a.status === "NEW" ? 0 : 1;
      const bo = b.status === "NEW" ? 0 : 1;
      if (ao !== bo) return ao - bo;
      return (b.strengthScore ?? 0) - (a.strengthScore ?? 0);
    }
    default:
      return 0;
  }
}

// ============================================================
// Page
// ============================================================

export default function RuleSessionPage() {
  const params = useParams<{ id: string }>();
  const ruleId = params?.id ?? "";
  const queryClient = useQueryClient();

  const [sortKey, setSortKey] = useState<SortKey>("strength");
  const [externalFilter, setExternalFilter] =
    useState<ExternalFilter>("all");

  // For most sorts the data fits in 50-row pages and "load more" works
  // fine. For premium-based sort we need the full match set in one shot
  // so the client can rank correctly across pages — there's no SQL
  // ORDER BY for premium because it depends on policies referenced
  // inside evidenceJson. Same goes for the Har HaBituach filter — a
  // 50-row page would only filter that page, not the full set.
  const needsFullSet =
    sortKey === "premium" || externalFilter !== "all";
  const pageSize = needsFullSet ? 2000 : PAGE_SIZE;

  const {
    data,
    isLoading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["rule-session", ruleId, pageSize],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      fetchSession(ruleId, pageParam as number, pageSize),
    getNextPageParam: (lastPage) =>
      lastPage.pagination.nextOffset ?? undefined,
    enabled: !!ruleId,
  });

  const actionMutation = useMutation({
    mutationFn: patchInsight,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rule-session", ruleId] });
      queryClient.invalidateQueries({ queryKey: ["insights"] });
    },
  });

  // Memoize the sorted item list — it depends on the loaded pages and
  // the active sort key. Hooks must run unconditionally on every render,
  // so we compute this BEFORE the early returns below.
  const sortedItems = useMemo<SessionItem[]>(() => {
    const flat: SessionItem[] =
      data?.pages.flatMap((page) => page.items) ?? [];
    const filtered = flat.filter((i) => {
      const hasExternal = i.customer.externalPolicyCount > 0;
      if (externalFilter === "only") return hasExternal;
      if (externalFilter === "without") return !hasExternal;
      return true;
    });
    const open = filtered.filter((i) => i.status === "NEW");
    const handled = filtered.filter((i) => i.status !== "NEW");
    open.sort((a, b) => comparePrimary(a, b, sortKey));
    handled.sort((a, b) => comparePrimary(a, b, sortKey));
    return [...open, ...handled];
  }, [data, sortKey, externalFilter]);

  // -------------------- Loading --------------------
  if (isLoading) {
    return (
      <div className="space-y-6 animate-[fadeIn_0.3s_ease-out_forwards]">
        <Link
          href="/rules"
          className="inline-flex items-center gap-1.5 text-sm text-surface-500 hover:text-violet-700"
        >
          <ArrowRight className="h-3.5 w-3.5" />
          חזור לחוקים
        </Link>
        <Card>
          <Skeleton className="mb-3 h-5 w-1/3" />
          <Skeleton className="mb-2 h-3 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
        </Card>
        <Card>
          <Skeleton className="mb-3 h-4 w-40" />
          <Skeleton className="h-2 w-full rounded-full" />
        </Card>
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Card key={i} padding="sm">
              <Skeleton className="mb-2 h-4 w-1/2" />
              <Skeleton className="mb-2 h-3 w-3/4" />
              <Skeleton className="h-3 w-1/3" />
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // -------------------- Error --------------------
  if (error) {
    return (
      <div className="space-y-6 animate-[fadeIn_0.3s_ease-out_forwards]">
        <Link
          href="/rules"
          className="inline-flex items-center gap-1.5 text-sm text-surface-500 hover:text-violet-700"
        >
          <ArrowRight className="h-3.5 w-3.5" />
          חזור לחוקים
        </Link>
        <Card>
          <EmptyState
            icon={AlertCircle}
            title="שגיאה בטעינת הסשן"
            description={(error as Error).message}
          />
        </Card>
      </div>
    );
  }

  if (!data || data.pages.length === 0) return null;

  const firstPage = data.pages[0];
  const { rule, stats } = firstPage;

  // The API already returns items open-first, then handled, each group
  // ordered by strengthScore desc. We re-sort client-side based on the
  // user's selected sort key, but always keep open items above handled
  // items as a HARD secondary sort — handled cards stay at the bottom
  // because Rafi works through the open queue first.
  const sorted: SessionItem[] = sortedItems;
  const loadedCount = sorted.length;

  const percent = stats.total > 0 ? Math.round((stats.handled / stats.total) * 100) : 0;

  // Determine if a given insight is currently being mutated (for disabling buttons)
  const pendingId =
    actionMutation.isPending && actionMutation.variables
      ? actionMutation.variables.id
      : null;

  // -------------------- Render --------------------
  return (
    <div className="space-y-6 animate-[fadeIn_0.3s_ease-out_forwards]">
      {/* Breadcrumb */}
      <Link
        href="/rules"
        className="inline-flex items-center gap-1.5 text-sm text-surface-500 hover:text-violet-700"
      >
        <ArrowRight className="h-3.5 w-3.5" />
        חזור לחוקים
      </Link>

      {/* Rule header */}
      <Card>
        <div className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <Target className="mt-1 h-5 w-5 shrink-0 text-violet-600" />
              <h1 className="text-xl font-bold text-surface-900">
                {rule.title}
              </h1>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {typeof rule.baseStrength === "number" && (
                <span
                  className="inline-flex items-center gap-1 rounded-full border border-violet-300/50 bg-violet-500/10 px-2 py-0.5 text-[11px] font-medium text-violet-700"
                  title="ציון חוזק בסיסי של החוק"
                >
                  חוזק <span className="number">{rule.baseStrength}</span>
                </span>
              )}
              {rule.kind === "service_tip" ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-cyan-300/50 bg-cyan-500/10 px-2 py-0.5 text-[11px] font-medium text-cyan-700">
                  🤝 טיפ שירות
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300/50 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                  💰 הזדמנות
                </span>
              )}
              {rule.category && (
                <Badge variant={categoryVariant[rule.category] ?? "default"}>
                  {rule.category}
                </Badge>
              )}
            </div>
          </div>

          <p className="whitespace-pre-wrap text-sm leading-relaxed text-surface-700">
            {rule.body}
          </p>

          {rule.triggerHint && (
            <p className="text-xs text-surface-400">
              מתי להשתמש: {rule.triggerHint}
            </p>
          )}
        </div>
      </Card>

      {/* Progress */}
      <Card>
        <div className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-semibold text-surface-900">
                <Users className="h-4 w-4 text-violet-500" />
                התקדמות בסשן
              </h2>
              <p className="mt-1 text-xs text-surface-500">
                {stats.total === 0
                  ? "אין לקוחות שעונים לכלל הזה כרגע."
                  : `אתה עובד על הכלל הזה — ${stats.handled}/${stats.total} טופלו`}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="number text-2xl font-bold text-emerald-600">
                  {stats.handled}
                </p>
                <p className="text-[11px] uppercase tracking-wide text-surface-500">
                  טופלו
                </p>
              </div>
              <div className="text-right">
                <p className="number text-2xl font-bold text-violet-600">
                  {stats.open}
                </p>
                <p className="text-[11px] uppercase tracking-wide text-surface-500">
                  נשארו
                </p>
              </div>
              <div className="text-right">
                <p className="number text-2xl font-bold text-surface-700">
                  {stats.total}
                </p>
                <p className="text-[11px] uppercase tracking-wide text-surface-500">
                  סה״כ
                </p>
              </div>
            </div>
          </div>
          <ProgressBar value={percent} variant="primary" />
        </div>
      </Card>

      {/* Action mutation error banner */}
      {actionMutation.isError && (
        <Card className="border-rose-300/60 bg-rose-50/40">
          <div className="flex items-start gap-2 text-sm text-rose-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{(actionMutation.error as Error).message}</span>
          </div>
        </Card>
      )}

      {/* Empty state */}
      {stats.total === 0 && (
        <Card>
          <EmptyState
            icon={Users}
            title="אין לקוחות שעונים לכלל זה"
            description="כשייווצרו תובנות חדשות על בסיס החוק הזה, הן יופיעו כאן."
          />
        </Card>
      )}

      {/* Customer list */}
      {stats.total > 0 && (
        <div className="space-y-3">
          {/* Sort selector — open items always stay above handled ones,
              this controls the order WITHIN each group. */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-surface-200/80 bg-white/55 px-3 py-2 backdrop-blur-md">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <div className="flex items-center gap-2">
                <label
                  htmlFor="session-sort"
                  className="text-xs text-surface-600"
                >
                  מיון לפי:
                </label>
                <select
                  id="session-sort"
                  value={sortKey}
                  onChange={(e) => setSortKey(e.target.value as SortKey)}
                  className="rounded-lg border border-white/80 bg-white/80 px-2.5 py-1 text-xs text-surface-900 text-right backdrop-blur-sm focus:border-violet-400/60 focus:bg-white/90 focus:outline-none focus:ring-2 focus:ring-violet-400/25"
                >
                  {SORT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <label
                  htmlFor="session-external-filter"
                  className="text-xs text-surface-600"
                >
                  הר הביטוח:
                </label>
                <select
                  id="session-external-filter"
                  value={externalFilter}
                  onChange={(e) =>
                    setExternalFilter(e.target.value as ExternalFilter)
                  }
                  className="rounded-lg border border-white/80 bg-white/80 px-2.5 py-1 text-xs text-surface-900 text-right backdrop-blur-sm focus:border-violet-400/60 focus:bg-white/90 focus:outline-none focus:ring-2 focus:ring-violet-400/25"
                >
                  {EXTERNAL_FILTER_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <span className="text-[11px] text-surface-400">
              טופלו תמיד בתחתית
            </span>
          </div>

          {sorted.map((item) => {
            const isHandled = item.status !== "NEW";
            const isActing = pendingId === item.insightId;
            return (
              <Card
                key={item.insightId}
                padding="sm"
                className={cn(
                  "transition-opacity",
                  isHandled && "opacity-60"
                )}
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  {/* Left: customer + insight */}
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-bold text-surface-900">
                        {item.customer.fullName || "לקוח"}
                      </h3>
                      {typeof item.customer.age === "number" && (
                        <span className="text-xs text-surface-500">
                          גיל <span className="number">{item.customer.age}</span>
                        </span>
                      )}
                      {typeof item.customer.tenureYears === "number" && (
                        <span
                          className="inline-flex items-center gap-1 rounded-full border border-emerald-300/50 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700"
                          title="ותק לקוח אצלנו — לפי הפוליסה הוותיקה ביותר"
                        >
                          ותק{" "}
                          <span className="number">
                            {item.customer.tenureYears.toFixed(1)}
                          </span>{" "}
                          שנים
                        </span>
                      )}
                      {item.customer.phone && (
                        <span className="inline-flex items-center gap-1 text-xs text-surface-500">
                          <Phone className="h-3 w-3" />
                          <span className="number">{item.customer.phone}</span>
                        </span>
                      )}
                      {item.customer.externalPolicyCount > 0 && (
                        <Badge variant="info">
                          <FolderOpen className="h-3 w-3" />
                          📂 פוטנציאל ({item.customer.externalPolicyCount})
                        </Badge>
                      )}
                      {item.customer.source === "HAR_HABITUACH_ONLY" && (
                        <Badge variant="warning">
                          <UserX className="h-3 w-3" />
                          ללא תיק פעיל
                        </Badge>
                      )}
                      <span
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-violet-700"
                        title="חוזק התובנה"
                      >
                        <span>חוזק</span>
                        <ScoreWithBreakdown
                          score={item.strengthScore}
                          title={item.insightTitle}
                          breakdown={item.scoreBreakdown}
                        />
                      </span>
                      {isHandled && (
                        <Badge variant="success">
                          <Check className="h-3 w-3" />
                          ✓ טופל
                        </Badge>
                      )}
                    </div>

                    <p className="text-sm font-medium text-surface-800">
                      {item.insightTitle}
                    </p>
                    <p className="text-sm leading-relaxed text-surface-600">
                      {item.insightSummary}
                    </p>
                    {item.whyNow && (
                      <p className="text-xs text-surface-400">
                        למה עכשיו: {item.whyNow}
                      </p>
                    )}
                    {item.triggeringPolicies.length > 0 && (
                      <TriggeringPoliciesList
                        policies={item.triggeringPolicies}
                      />
                    )}
                  </div>

                  {/* Right: actions */}
                  <div className="flex shrink-0 flex-wrap items-center gap-2 lg:flex-col lg:items-stretch">
                    {!isHandled && (
                      <>
                        <Button
                          variant="primary"
                          size="sm"
                          disabled={isActing}
                          onClick={() =>
                            actionMutation.mutate({
                              id: item.insightId,
                              status: "REVIEWED",
                            })
                          }
                        >
                          {isActing ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Check className="h-3 w-3" />
                          )}
                          ✓ טיפלתי
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={isActing}
                          onClick={() =>
                            actionMutation.mutate({
                              id: item.insightId,
                              status: "DISMISSED",
                            })
                          }
                        >
                          <X className="h-3 w-3" />✗ לא רלוונטי
                        </Button>
                        <Link
                          href={`/customers/${item.customer.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-white/70 bg-white/60 px-3 text-xs font-medium text-surface-800 backdrop-blur-md hover:border-violet-300/70 hover:text-violet-700"
                        >
                          <ExternalLink className="h-3 w-3" />↗ פתח כרטיס
                        </Link>
                        <Link
                          href={`/customers/${item.customer.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-indigo-300/60 bg-indigo-500/10 px-3 text-xs font-medium text-indigo-700 backdrop-blur-md hover:border-indigo-400/80 hover:bg-indigo-500/15"
                          title="צור הודעה עם AI — דרך כרטיס הלקוח"
                        >
                          <Sparkles className="h-3 w-3" />
                          צור הודעה עם AI
                        </Link>
                      </>
                    )}

                    {isHandled && (
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/customers/${item.customer.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-white/70 bg-white/60 px-3 text-xs font-medium text-surface-600 backdrop-blur-md hover:border-violet-300/70 hover:text-violet-700"
                        >
                          <ExternalLink className="h-3 w-3" />↗ פתח כרטיס
                        </Link>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={isActing}
                          onClick={() =>
                            actionMutation.mutate({
                              id: item.insightId,
                              status: "NEW",
                            })
                          }
                          title="החזר לסטטוס פתוח"
                        >
                          {isActing ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : null}
                          שחזר
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}

          {/* Load more / end-of-list footer */}
          <div className="flex flex-col items-center gap-2 pt-2">
            <p className="text-xs text-surface-500">
              מציג <span className="number">{loadedCount}</span> מתוך{" "}
              <span className="number">{stats.total}</span>
            </p>
            {hasNextPage ? (
              <Button
                variant="secondary"
                size="sm"
                disabled={isFetchingNextPage}
                onClick={() => fetchNextPage()}
              >
                {isFetchingNextPage ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : null}
                טען עוד {Math.min(PAGE_SIZE, stats.total - loadedCount)}
              </Button>
            ) : (
              loadedCount > PAGE_SIZE && (
                <p className="text-xs text-surface-400">— סוף הרשימה —</p>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Triggering policies — small inline list under each insight.
// Renders as a quiet section ("פוליסות שהפעילו את הכלל") that lets
// Rafi see exactly which policies the matcher used to fire the rule.
// Older insights without matched-policy data don't reach this
// component (the parent guards with .length > 0).
// ============================================================

function TriggeringPoliciesList({
  policies,
}: {
  policies: TriggeringPolicy[];
}) {
  return (
    <div className="mt-1.5 rounded-md border border-surface-100 bg-surface-50/40 px-2.5 py-2">
      <p className="mb-1 text-[11px] font-semibold text-surface-600">
        פוליסות שהפעילו את הכלל
      </p>
      <ul className="space-y-0.5">
        {policies.map((p) => {
          const { amount, suffix } = premiumDisplay(p);
          // Build the segments and join with " · ", omitting any
          // segment that has no data (e.g. missing startDate). This
          // keeps the line tidy without leaving stranded separators.
          const segments: ReactNode[] = [
            <span
              key="num"
              className="number font-mono text-[11px] text-surface-700"
            >
              {p.policyNumber}
            </span>,
            <span key="ins" className="text-[11px] text-surface-500">
              {p.insurer}
            </span>,
          ];
          if (p.startDate) {
            segments.push(
              <span key="date" className="text-[11px] text-surface-500">
                {formatDate(p.startDate)}
              </span>
            );
          }
          if (amount != null) {
            segments.push(
              <span key="prem" className="text-[11px] text-surface-500">
                <span className="number">{formatCurrency(amount)}</span>
                <span> </span>
                <span>{suffix}</span>
              </span>
            );
          }
          return (
            <li
              key={p.id}
              className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5"
            >
              {segments.map((seg, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-baseline gap-1.5"
                >
                  {seg}
                  {idx < segments.length - 1 && (
                    <span className="text-surface-300">·</span>
                  )}
                </span>
              ))}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
