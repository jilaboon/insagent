"use client";

/**
 * Executive Intelligence Panel
 * ============================
 *
 * Four-card headline strip for the Customer 360 view. Turns the customer
 * profile from a passive viewer into a tool by surfacing — at a glance —
 * what we know, what's missing, what changed recently, and where the
 * opportunity is.
 *
 * Reads exclusively from props that already exist on `CustomerDetail`
 * (contextSummary, financialProducts, imports, insights, policies). No
 * extra fetches. No mutations. No hooks beyond `useMemo` for tidy
 * derivations.
 *
 * Empty / loading semantics: when `contextSummary` is undefined (older
 * API responses still in-flight after a deploy), every card falls back
 * to "מתעדכן..." instead of crashing.
 */

import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { formatDate, cn } from "@/lib/utils";
import { policyCategoryLabels } from "@/lib/constants";
import type { CustomerDetail } from "@/lib/api/hooks";
import {
  Sparkles,
  ShieldAlert,
  TrendingUp,
  Target,
  type LucideIcon,
} from "lucide-react";

// ============================================================
// Tone palette — one tone per card. Keeps the visual hierarchy
// consistent and lets us swap shades without touching markup.
// ============================================================

type Tone = "indigo" | "amber" | "cyan" | "emerald";

const TONE_CLASSES: Record<
  Tone,
  { icon: string; headline: string; bullet: string }
> = {
  indigo: {
    icon: "text-indigo-600",
    headline: "text-indigo-700",
    bullet: "text-indigo-500",
  },
  amber: {
    icon: "text-amber-600",
    headline: "text-amber-800",
    bullet: "text-amber-600",
  },
  cyan: {
    icon: "text-cyan-600",
    headline: "text-cyan-700",
    bullet: "text-cyan-500",
  },
  emerald: {
    icon: "text-emerald-600",
    headline: "text-emerald-700",
    bullet: "text-emerald-500",
  },
};

// ============================================================
// Hebrew label helpers
// ============================================================

const IMPORT_KIND_LABELS: Record<string, string> = {
  BAFI_LIFE: "BAFI",
  BAFI_ELEMENTARY: "BAFI",
  HAR_HABITUACH: "הר הביטוח",
  MISLEKA_XML: "מסלקה",
};

function importKindLabel(kind: string | null | undefined): string {
  if (!kind) return "יבוא";
  return IMPORT_KIND_LABELS[kind] ?? kind;
}

// ============================================================
// Tile shell — used by every card to enforce visual rhythm.
// ============================================================

function PanelTile({
  icon: Icon,
  title,
  tone,
  headline,
  secondary,
  children,
  footer,
}: {
  icon: LucideIcon;
  title: string;
  tone: Tone;
  /**
   * Either a precomputed string ("5 גופים מוסדיים") or `null` if the
   * data isn't available yet. When null we render the loading copy.
   */
  headline: string | null;
  secondary: string | null;
  children?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const palette = TONE_CLASSES[tone];
  return (
    <Card padding="sm" className="flex h-full flex-col">
      <div className="mb-2 flex items-center gap-1.5">
        <Icon className={cn("h-3.5 w-3.5", palette.icon)} aria-hidden />
        <h4 className="text-xs font-semibold uppercase tracking-wide text-surface-700">
          {title}
        </h4>
      </div>
      <p
        className={cn(
          "text-2xl font-bold leading-tight number",
          palette.headline
        )}
      >
        {headline ?? "מתעדכן..."}
      </p>
      {secondary && (
        <p className="mt-1 text-xs text-surface-500">{secondary}</p>
      )}
      {children && (
        <ul className="mt-3 space-y-1 text-[11px] text-surface-600">
          {children}
        </ul>
      )}
      {footer && <div className="mt-auto pt-3">{footer}</div>}
    </Card>
  );
}

function MicroLine({
  tone,
  children,
}: {
  tone: Tone;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-1.5">
      <span
        aria-hidden
        className={cn(
          "mt-1 h-1 w-1 shrink-0 rounded-full",
          TONE_CLASSES[tone].bullet === "text-indigo-500"
            ? "bg-indigo-400"
            : TONE_CLASSES[tone].bullet === "text-amber-600"
            ? "bg-amber-400"
            : TONE_CLASSES[tone].bullet === "text-cyan-500"
            ? "bg-cyan-400"
            : "bg-emerald-400"
        )}
      />
      <span className="leading-snug">{children}</span>
    </li>
  );
}

// ============================================================
// Public component
// ============================================================

type Customer = CustomerDetail;

export function ExecutiveIntelligencePanel({
  customer,
}: {
  customer: Customer;
}) {
  const summary = customer.contextSummary;

  // Card 1 — מה אנחנו יודעים
  const knowledge = useMemo(() => {
    if (!summary) {
      return { headline: null as string | null, secondary: null as string | null, lines: [] as string[] };
    }
    const headline =
      summary.providersCount >= 1
        ? `${summary.providersCount} גופים מוסדיים`
        : "כיסוי בסיסי בלבד";

    const completenessCopy: Record<number, string> = {
      0: "תיק בית מבוסס משרד",
      1: "כולל נתון מהר הביטוח",
      2: "כולל נתון ממסלקה",
      3: "תמונה מלאה כולל בנקאות",
    };
    const secondary = completenessCopy[summary.completenessScore] ?? null;

    const activeOfficePolicies = customer.policies.filter(
      (p) =>
        (p.status === "ACTIVE" ||
          p.status === "PROPOSAL" ||
          p.status === "UNKNOWN") &&
        p.externalSource !== "HAR_HABITUACH"
    ).length;
    const externalPolicies = customer.policies.filter(
      (p) => p.externalSource === "HAR_HABITUACH"
    ).length;
    const institutionalCount = customer.financialProducts?.length ?? 0;

    const lines: string[] = [];
    if (activeOfficePolicies > 0) {
      lines.push(`${activeOfficePolicies} פוליסות פעילות אצלנו`);
    }
    if (institutionalCount > 0) {
      lines.push(`${institutionalCount} מוצרי פנסיה/גמל`);
    }
    if (externalPolicies > 0) {
      lines.push(`${externalPolicies} פוליסות חיצוניות`);
    }

    return { headline, secondary, lines };
  }, [summary, customer.policies, customer.financialProducts]);

  // Card 2 — מה חסר
  const gaps = useMemo(() => {
    if (!summary) {
      return { headline: null as string | null, secondary: null as string | null, lines: [] as string[] };
    }
    const gapsArr = summary.insuranceGaps ?? [];
    const missingBalance = summary.missingBalanceCount ?? 0;

    let headline: string;
    if (gapsArr.length > 0) {
      headline = `${gapsArr.length} חוסרים`;
    } else {
      headline = "אין חוסרים מהותיים";
    }

    let secondary: string;
    if (gapsArr.length > 0) {
      secondary = "ענפים שלא נמצאו אצל הלקוח";
    } else if (missingBalance > 0) {
      secondary = `${missingBalance} מוצרים בלי נתון יתרה`;
    } else {
      secondary = "כל הענפים הבסיסיים מכוסים";
    }

    let lines: string[] = [];
    if (gapsArr.length > 0) {
      lines = gapsArr
        .slice(0, 3)
        .map((code) => policyCategoryLabels[code] ?? code);
    } else if (missingBalance > 0) {
      lines = [`${missingBalance} מוצרים ממסלקה ללא יתרה`];
    }

    return { headline, secondary, lines };
  }, [summary]);

  // Card 3 — מה השתנה (last 30 days)
  const change = useMemo(() => {
    if (!summary) {
      return { headline: null as string | null, secondary: null as string | null, lines: [] as string[] };
    }
    const newProducts = summary.newProductsLast30Days ?? 0;
    const expiring = summary.policiesExpiringWithin90Days ?? 0;

    let headline: string;
    let secondary: string;
    if (newProducts > 0) {
      headline = `${newProducts} מוצרים חדשים`;
      secondary = "התווספו לתיק ב־30 הימים האחרונים";
    } else if (expiring > 0) {
      headline = `${expiring} פוליסות מתחדשות`;
      secondary = "מסתיימות בתוך 90 יום";
    } else {
      headline = "אין שינויים מהותיים";
      secondary = "תיק יציב";
    }

    const lines: string[] = [];
    const lastImport = customer.imports?.[0];
    if (lastImport) {
      const label = importKindLabel(lastImport.kind);
      lines.push(`יבוא אחרון: ${label} · ${formatDate(lastImport.createdAt)}`);
    }

    // Latest valuation across all financial products.
    const latestValuation = (customer.financialProducts ?? [])
      .map((p) => p.valuationDate)
      .filter((d): d is string => !!d)
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
    if (latestValuation) {
      lines.push(`עדכון יתרה אחרון: ${formatDate(latestValuation)}`);
    }

    return { headline, secondary, lines };
  }, [summary, customer.imports, customer.financialProducts]);

  // Card 4 — מה ההזדמנות
  const opportunity = useMemo(() => {
    if (!summary) {
      return {
        headline: null as string | null,
        secondary: null as string | null,
        topInsight: null as Customer["insights"][number] | null,
      };
    }

    // Strongest open insight — sort defensively in case the API hasn't
    // already ordered them, since we depend on this for the secondary.
    const topInsight =
      [...customer.insights]
        .filter((i) => i.status === "NEW")
        .sort((a, b) => b.strengthScore - a.strengthScore)[0] ?? null;

    let headline: string;
    if (summary.strongInsightsCount > 0) {
      headline = `${summary.strongInsightsCount} הזדמנויות חזקות`;
    } else if (topInsight && summary.topInsightStrengthScore != null) {
      headline = `${summary.topInsightStrengthScore} נקודות`;
    } else {
      headline = "אין הזדמנויות פתוחות";
    }

    const secondary = topInsight ? topInsight.title : "ממתין למחזור תובנות";

    return { headline, secondary, topInsight };
  }, [summary, customer.insights]);

  function scrollToInsights() {
    const el = document.getElementById("insights-section");
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
      {/* Card 1 — what we know */}
      <PanelTile
        icon={Sparkles}
        title="מה אנחנו יודעים"
        tone="indigo"
        headline={knowledge.headline}
        secondary={knowledge.secondary}
      >
        {knowledge.lines.map((line) => (
          <MicroLine key={line} tone="indigo">
            {line}
          </MicroLine>
        ))}
      </PanelTile>

      {/* Card 2 — what's missing */}
      <PanelTile
        icon={ShieldAlert}
        title="מה חסר"
        tone="amber"
        headline={gaps.headline}
        secondary={gaps.secondary}
      >
        {gaps.lines.map((line) => (
          <MicroLine key={line} tone="amber">
            {line}
          </MicroLine>
        ))}
      </PanelTile>

      {/* Card 3 — what changed */}
      <PanelTile
        icon={TrendingUp}
        title="מה השתנה"
        tone="cyan"
        headline={change.headline}
        secondary={change.secondary}
      >
        {change.lines.map((line) => (
          <MicroLine key={line} tone="cyan">
            {line}
          </MicroLine>
        ))}
      </PanelTile>

      {/* Card 4 — opportunity */}
      <PanelTile
        icon={Target}
        title="מה ההזדמנות"
        tone="emerald"
        headline={opportunity.headline}
        secondary={opportunity.secondary}
        footer={
          summary && customer.insights.length > 0 ? (
            <button
              type="button"
              onClick={scrollToInsights}
              className="inline-flex items-center gap-1 rounded-md border border-emerald-300/60 bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-700 hover:bg-emerald-500/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            >
              פתח רשימת תובנות
            </button>
          ) : null
        }
      />
    </div>
  );
}
