"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";

interface Staleness {
  isStale: boolean;
  reasons: string[];
  lastInsightGenerationAt: string | null;
  lastImportAt: string | null;
  lastImportFileName: string | null;
  lastImportSource: string | null;
  lastRuleChangeAt: string | null;
}

const POLL_INTERVAL_MS = 30_000;

/**
 * Shown at the top of surfaces that depend on fresh insights (dashboard,
 * /insights). Points the user to run insight generation when the data
 * or rule set has changed since the last run.
 *
 * We explicitly DON'T auto-trigger generation — the user controls when.
 * Rafi might upload multiple files in a row or tweak several rules
 * before wanting to see the new picture.
 */
export function StalnessBanner() {
  const [data, setData] = useState<Staleness | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/insights/staleness", {
          cache: "no-store",
        });
        if (!res.ok) return;
        const body = (await res.json()) as Staleness;
        if (!cancelled) setData(body);
      } catch {
        /* silent */
      }
    }

    load();
    const timer = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  if (!data || !data.isStale) return null;

  const reasonText = buildReasonText(data);

  return (
    <Card
      className="border-amber-300/60 bg-amber-50/60"
      padding="sm"
    >
      <div className="flex flex-wrap items-center gap-3">
        <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-amber-900">
            יש דאטה חדש — כדאי להריץ חיקור תובנות
          </p>
          <p className="mt-0.5 text-xs text-amber-800/80">{reasonText}</p>
        </div>
        <Link
          href="/insights"
          className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/60 bg-amber-500/15 px-3 py-1.5 text-xs font-medium text-amber-900 transition-colors hover:bg-amber-500/25"
        >
          <Sparkles className="h-3.5 w-3.5" />
          חקור תובנות
        </Link>
      </div>
    </Card>
  );
}

function buildReasonText(s: Staleness): string {
  const parts: string[] = [];

  if (s.reasons.includes("import") && s.lastImportFileName) {
    const when = s.lastImportAt
      ? formatRelative(new Date(s.lastImportAt))
      : "";
    const source = s.lastImportSource ? ` (${s.lastImportSource})` : "";
    parts.push(`יובא קובץ חדש${source}: ${s.lastImportFileName} ${when}`);
  }

  if (s.reasons.includes("rule_change") && s.lastRuleChangeAt) {
    const when = formatRelative(new Date(s.lastRuleChangeAt));
    parts.push(`חוק שונה ${when}`);
  }

  if (s.lastInsightGenerationAt) {
    const when = formatRelative(new Date(s.lastInsightGenerationAt));
    parts.push(`חיקור תובנות אחרון: ${when}`);
  } else {
    parts.push("מעולם לא הורץ חיקור תובנות מלא");
  }

  return parts.join(" · ");
}

function formatRelative(d: Date): string {
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "עכשיו";
  if (mins < 60) return `לפני ${mins} דקות`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `לפני ${hours} שעות`;
  const days = Math.floor(hours / 24);
  return `לפני ${days} ימים`;
}
