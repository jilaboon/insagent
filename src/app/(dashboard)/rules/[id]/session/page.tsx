"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import {
  useQuery,
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
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ui/progress-bar";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

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
}

interface SessionItem {
  insightId: string;
  status: InsightStatus;
  strengthScore: number;
  insightTitle: string;
  insightSummary: string;
  whyNow: string | null;
  customer: SessionCustomer;
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

interface SessionResponse {
  rule: SessionRule;
  stats: { total: number; open: number; handled: number };
  items: SessionItem[];
}

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

async function fetchSession(ruleId: string): Promise<SessionResponse> {
  const res = await fetch(`/api/rules/${ruleId}/session`);
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
// Page
// ============================================================

export default function RuleSessionPage() {
  const params = useParams<{ id: string }>();
  const ruleId = params?.id ?? "";
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["rule-session", ruleId],
    queryFn: () => fetchSession(ruleId),
    enabled: !!ruleId,
  });

  const actionMutation = useMutation({
    mutationFn: patchInsight,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rule-session", ruleId] });
      queryClient.invalidateQueries({ queryKey: ["insights"] });
    },
  });

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

  if (!data) return null;

  const { rule, stats, items } = data;

  // Sort: open items first, handled after. Within each group preserve
  // the API's strengthScore desc ordering.
  const sorted = [...items].sort((a, b) => {
    const aOpen = a.status === "NEW" ? 0 : 1;
    const bOpen = b.status === "NEW" ? 0 : 1;
    if (aOpen !== bOpen) return aOpen - bOpen;
    return 0; // keep API order
  });

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
                        className="inline-flex items-center gap-1 rounded-full border border-violet-300/50 bg-violet-500/10 px-2 py-0.5 text-[11px] font-medium text-violet-700"
                        title="חוזק התובנה"
                      >
                        חוזק <span className="number">{item.strengthScore}</span>
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
        </div>
      )}
    </div>
  );
}
