"use client";

import { JetBrains_Mono } from "next/font/google";
import { useEffect, useState } from "react";
import { STUDIO_QUEUE, STUDIO_STATS } from "../_shared/mock-queue";

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-terminal-mono",
});

// --- small primitives ---------------------------------------------------

const CORNER = (pos: "tl" | "tr" | "bl" | "br") => {
  const base = "absolute h-[5px] w-[5px] bg-neutral-700";
  const positions: Record<typeof pos, string> = {
    tl: "top-[-1px] left-[-1px]",
    tr: "top-[-1px] right-[-1px]",
    bl: "bottom-[-1px] left-[-1px]",
    br: "bottom-[-1px] right-[-1px]",
  };
  return <span className={`${base} ${positions[pos]}`} aria-hidden />;
};

function Corners() {
  return (
    <>
      {CORNER("tl")}
      {CORNER("tr")}
      {CORNER("bl")}
      {CORNER("br")}
    </>
  );
}

// Category → {short code, color}
const CATEGORY_STYLE: Record<
  string,
  { code: string; dot: string; text: string; bg: string }
> = {
  AGE_MILESTONE: {
    code: "AGE-MS",
    dot: "bg-cyan-400",
    text: "text-cyan-300",
    bg: "bg-cyan-400/10",
  },
  HIGH_VALUE: {
    code: "HI-VAL",
    dot: "bg-emerald-400",
    text: "text-emerald-300",
    bg: "bg-emerald-400/10",
  },
  COST_OPTIMIZATION: {
    code: "COST-OPT",
    dot: "bg-amber-400",
    text: "text-amber-300",
    bg: "bg-amber-400/10",
  },
  COVERAGE_GAP: {
    code: "COV-GAP",
    dot: "bg-rose-400",
    text: "text-rose-300",
    bg: "bg-rose-400/10",
  },
  POLICY_AGE_REVIEW: {
    code: "POL-REV",
    dot: "bg-violet-400",
    text: "text-violet-300",
    bg: "bg-violet-400/10",
  },
  SERVICE: {
    code: "SVC",
    dot: "bg-neutral-400",
    text: "text-neutral-300",
    bg: "bg-neutral-400/10",
  },
};

function scoreColor(score: number) {
  if (score >= 85) return "text-emerald-400";
  if (score >= 70) return "text-cyan-300";
  if (score >= 55) return "text-amber-300";
  return "text-rose-400";
}

// -----------------------------------------------------------------------

export default function TerminalStudioPage() {
  const [now, setNow] = useState<Date | null>(null);
  const [cursorOn, setCursorOn] = useState(true);
  const [hoverRank, setHoverRank] = useState<number | null>(null);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    const c = setInterval(() => setCursorOn((v) => !v), 530);
    return () => {
      clearInterval(t);
      clearInterval(c);
    };
  }, []);

  const ts = now
    ? `${String(now.getHours()).padStart(2, "0")}:${String(
        now.getMinutes(),
      ).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`
    : "--:--:--";

  const date = now
    ? `${String(now.getFullYear())}-${String(now.getMonth() + 1).padStart(
        2,
        "0",
      )}-${String(now.getDate()).padStart(2, "0")}`
    : "----/--/--";

  return (
    <div
      className={`${mono.variable} -m-8 min-h-screen bg-[#0B0D12] p-6 text-neutral-200`}
      style={{
        // CRT scanline overlay — very faint, on top but non-interactive
        backgroundImage:
          "repeating-linear-gradient(0deg, rgba(255,255,255,0.012) 0px, rgba(255,255,255,0.012) 1px, transparent 1px, transparent 3px)",
        fontFeatureSettings: "'tnum', 'zero', 'ss01'",
      }}
    >
      <style>{`
        .term-mono { font-family: var(--font-terminal-mono), ui-monospace, SFMono-Regular, Menlo, monospace; font-feature-settings: 'tnum','zero'; }
        .term-selection ::selection { background: #00D4A0; color: #0B0D12; }
        .vbar { background: repeating-linear-gradient(90deg, #1E242F 0 1px, transparent 1px 6px); }
        .hairline-b { box-shadow: inset 0 -1px 0 #1E242F; }
        .scan-animated {
          animation: termScan 8s linear infinite;
        }
        @keyframes termScan {
          0% { background-position: 0 0; }
          100% { background-position: 0 120px; }
        }
        .blink-cursor { display: inline-block; width: 0.6ch; background: #00D4A0; color: transparent; margin-inline-start: 4px; box-shadow: 0 0 8px rgba(0,212,160,0.6); }
        .row-hover:hover { background: #12161F; }
        .row-hover { border-right: 2px solid transparent; }
        .row-hover:hover { border-right-color: #38BDF8; }
        .tight-he { letter-spacing: -0.01em; }
      `}</style>

      <div className="term-selection selection:bg-emerald-400 selection:text-black">
        {/* ============ HEADER CHROME ============ */}
        <header
          className="relative flex items-center justify-between border border-neutral-800 bg-[#0D1117] px-4 py-2 text-[11px]"
          dir="ltr"
        >
          <Corners />
          <div className="flex items-center gap-4">
            {/* traffic lights — faux tmux */}
            <div className="flex items-center gap-[6px]">
              <span className="h-[9px] w-[9px] bg-rose-500/70" />
              <span className="h-[9px] w-[9px] bg-amber-400/70" />
              <span className="h-[9px] w-[9px] bg-emerald-400/80" />
            </div>
            <span className="text-neutral-600">│</span>
            <div className="flex items-center gap-2 text-neutral-400 term-mono">
              <span className="relative flex h-2 w-2">
                <span className="absolute inset-0 animate-ping rounded-none bg-emerald-400/70" />
                <span className="relative h-2 w-2 bg-emerald-400" />
              </span>
              <span className="font-medium tracking-[0.05em] text-emerald-300">
                CONN:LIVE
              </span>
            </div>
            <span className="text-neutral-600">│</span>
            <span className="term-mono tracking-[0.05em] text-neutral-500">
              QUEUE://TODAY
            </span>
            <span className="text-neutral-600">·</span>
            <span className="term-mono tracking-[0.05em] text-neutral-300">
              {STUDIO_STATS.queueToday.toString().padStart(3, "0")} ITEMS
            </span>
            <span className="text-neutral-600">│</span>
            <span className="term-mono tracking-[0.05em] text-neutral-500">
              REGION:<span className="text-neutral-300">IL-TLV-1</span>
            </span>
          </div>

          <div className="flex items-center gap-4 term-mono text-neutral-400">
            <span className="tracking-[0.05em]">
              <span className="text-neutral-500">DATE </span>
              <span className="text-neutral-200 tabular-nums">{date}</span>
            </span>
            <span className="text-neutral-600">│</span>
            <span className="tracking-[0.05em]">
              <span className="text-neutral-500">UTC </span>
              <span className="text-neutral-200 tabular-nums">{ts}</span>
            </span>
            <span className="text-neutral-600">│</span>
            <kbd className="border border-neutral-700 bg-[#12161F] px-[6px] py-[1px] text-[10px] tracking-[0.1em] text-neutral-300">
              ⌘ R
            </kbd>
            <span className="text-neutral-500">refresh</span>
            <span className="text-neutral-600">│</span>
            <kbd className="border border-neutral-700 bg-[#12161F] px-[6px] py-[1px] text-[10px] tracking-[0.1em] text-neutral-300">
              ⌘ K
            </kbd>
            <span className="text-neutral-500">search</span>
          </div>
        </header>

        {/* ============ TITLE STRIP ============ */}
        <section
          className="relative mt-[-1px] flex items-end justify-between border border-neutral-800 bg-[#0B0D12] px-4 pt-5 pb-4"
          dir="ltr"
        >
          <Corners />
          <div>
            <div className="flex items-baseline gap-3">
              <span
                className="term-mono text-[11px] tracking-[0.18em] text-emerald-400"
                style={{ textShadow: "0 0 12px rgba(0,212,160,0.4)" }}
              >
                INSAGENT / STUDIO / TERMINAL.v1
              </span>
              <span className="term-mono text-[10px] tracking-[0.1em] text-neutral-600">
                [ OPERATOR MODE ]
              </span>
            </div>
            <h1
              className="mt-2 term-mono text-2xl font-medium tracking-[-0.02em] text-neutral-100"
              style={{ fontFeatureSettings: "'tnum','zero'" }}
            >
              priority_queue.today
              <span
                className={`blink-cursor ${cursorOn ? "opacity-100" : "opacity-0"}`}
              >
                █
              </span>
            </h1>
            <p className="mt-2 tight-he text-[12px] text-neutral-500">
              <span dir="rtl">
                תור עדיפויות יומי · 20 לקוחות מדורגים אלגוריתמית לפי ערך צפוי והסתברות המרה
              </span>
            </p>
          </div>

          <div className="flex items-center gap-2" dir="ltr">
            <StatusChip label="ALGO" value="v3.2.1" tone="neutral" />
            <StatusChip label="REBUILD" value="2H AGO" tone="neutral" />
            <StatusChip label="DRIFT" value="0.02%" tone="good" />
            <StatusChip label="STATUS" value="ACTIVE" tone="good" pulse />
          </div>
        </section>

        {/* ============ METRICS ROW ============ */}
        <section
          className="relative mt-[-1px] grid grid-cols-5 border border-neutral-800"
          dir="ltr"
        >
          <Metric
            label="BOOK_SIZE"
            value={STUDIO_STATS.totalCustomers.toLocaleString("en-US")}
            sub="customers"
            delta="+142 / 30d"
            deltaTone="good"
            accent="emerald"
          />
          <Metric
            label="INSIGHTS_OPEN"
            value={STUDIO_STATS.totalInsights.toLocaleString("en-US")}
            sub="signals generated"
            delta="+1.2k / 7d"
            deltaTone="good"
            accent="cyan"
            divider
          />
          <Metric
            label="QUEUE_TODAY"
            value={STUDIO_STATS.queueToday.toString().padStart(3, "0")}
            sub="ranked customers"
            delta="P95  94.2"
            deltaTone="neutral"
            accent="amber"
            divider
          />
          <Metric
            label="APPROVAL_WIP"
            value={STUDIO_STATS.pendingApprovals.toString().padStart(2, "0")}
            sub="awaiting רפי"
            delta="SLA 00:42h"
            deltaTone="warn"
            accent="amber"
            divider
          />
          <Metric
            label="CLOSED_TDY"
            value={STUDIO_STATS.completedToday.toString().padStart(2, "0")}
            sub="conversions"
            delta="+₪2.1M / mo"
            deltaTone="good"
            accent="emerald"
            divider
          />
        </section>

        {/* ============ MAIN GRID ============ */}
        <section
          className="mt-4 grid gap-4"
          style={{ gridTemplateColumns: "minmax(0, 1fr) 300px" }}
          dir="ltr"
        >
          {/* ===== QUEUE TABLE ===== */}
          <div className="relative border border-neutral-800 bg-[#0D1117]">
            <Corners />
            {/* table header bar */}
            <div className="flex items-center justify-between border-b border-neutral-800 bg-[#0B0D12] px-3 py-2 term-mono text-[10px] tracking-[0.1em] text-neutral-500">
              <div className="flex items-center gap-3">
                <span className="h-[6px] w-[6px] bg-emerald-400 shadow-[0_0_8px_rgba(0,212,160,0.7)]" />
                <span className="text-neutral-300">TABLE:priority_queue</span>
                <span className="text-neutral-700">│</span>
                <span>ROWS {STUDIO_QUEUE.length.toString().padStart(2, "0")}/20</span>
                <span className="text-neutral-700">│</span>
                <span>SORT score DESC</span>
                <span className="text-neutral-700">│</span>
                <span>FILTER none</span>
              </div>
              <div className="flex items-center gap-2">
                <kbd className="border border-neutral-700 bg-[#12161F] px-[6px] py-[1px] text-[10px] tracking-[0.1em] text-neutral-400">
                  J
                </kbd>
                <kbd className="border border-neutral-700 bg-[#12161F] px-[6px] py-[1px] text-[10px] tracking-[0.1em] text-neutral-400">
                  K
                </kbd>
                <span className="text-neutral-500">navigate</span>
                <span className="text-neutral-700">│</span>
                <kbd className="border border-neutral-700 bg-[#12161F] px-[6px] py-[1px] text-[10px] tracking-[0.1em] text-neutral-400">
                  ⏎
                </kbd>
                <span className="text-neutral-500">open</span>
              </div>
            </div>

            {/* column headers */}
            <div
              className="grid items-center gap-2 border-b border-neutral-800 bg-[#0B0D12] px-3 py-[6px] text-[10px] tracking-[0.1em] text-neutral-500 term-mono"
              style={{
                gridTemplateColumns:
                  "34px 44px minmax(0,1.1fr) 96px minmax(0,1.6fr) 68px 120px 110px",
              }}
            >
              <span>#</span>
              <span>TAG</span>
              <span>CUSTOMER</span>
              <span>AGE / POL</span>
              <span>PRIMARY_INSIGHT</span>
              <span className="text-right">SCORE</span>
              <span>VALUE_ILS</span>
              <span className="text-right">PHONE</span>
            </div>

            {/* rows */}
            <ul>
              {STUDIO_QUEUE.map((row) => {
                const cat = CATEGORY_STYLE[row.primaryInsight.category] ?? {
                  code: row.primaryInsight.category.slice(0, 6),
                  dot: "bg-neutral-400",
                  text: "text-neutral-300",
                  bg: "bg-neutral-400/10",
                };
                const isHover = hoverRank === row.rank;
                const valueNum = row.savings.replace(/[^0-9,]/g, "");
                return (
                  <li
                    key={row.rank}
                    onMouseEnter={() => setHoverRank(row.rank)}
                    onMouseLeave={() => setHoverRank(null)}
                    className={`grid cursor-pointer items-center gap-2 border-b border-neutral-900 px-3 py-[10px] transition-colors hairline-b ${
                      isHover
                        ? "bg-[#12161F]"
                        : "bg-transparent hover:bg-[#12161F]"
                    }`}
                    style={{
                      gridTemplateColumns:
                        "34px 44px minmax(0,1.1fr) 96px minmax(0,1.6fr) 68px 120px 110px",
                      borderRight: isHover
                        ? "2px solid #38BDF8"
                        : "2px solid transparent",
                    }}
                  >
                    {/* rank */}
                    <span
                      className={`term-mono text-[12px] tabular-nums ${
                        row.rank <= 3 ? "text-emerald-300" : "text-neutral-500"
                      }`}
                    >
                      {row.rank.toString().padStart(2, "0")}
                    </span>

                    {/* category tag */}
                    <div className="flex items-center gap-[5px]">
                      <span className={`h-[6px] w-[6px] ${cat.dot}`} />
                      <span
                        className={`term-mono text-[9px] tracking-[0.08em] ${cat.text}`}
                      >
                        {cat.code}
                      </span>
                    </div>

                    {/* customer */}
                    <div className="min-w-0" dir="rtl">
                      <div className="flex items-baseline gap-2">
                        <span className="truncate tight-he text-[13px] font-medium text-neutral-100">
                          {row.customerName}
                        </span>
                        <span
                          dir="ltr"
                          className="term-mono text-[10px] tracking-[0.05em] text-neutral-600"
                        >
                          ID-{(2840 + row.rank * 37).toString(16).toUpperCase()}
                        </span>
                      </div>
                      <div
                        dir="rtl"
                        className="mt-[2px] truncate tight-he text-[11px] text-neutral-500"
                      >
                        <span className="text-neutral-600">
                          {row.reasonIcon}
                        </span>{" "}
                        {row.whyToday}
                      </div>
                    </div>

                    {/* age / policies */}
                    <div className="term-mono text-[11px] tabular-nums text-neutral-400">
                      <span className="text-neutral-200">
                        {row.age.toString().padStart(2, "0")}
                      </span>
                      <span className="text-neutral-700"> / </span>
                      <span className="text-neutral-200">
                        {row.policyCount.toString().padStart(2, "0")}
                      </span>
                      <span className="text-neutral-700"> pol</span>
                    </div>

                    {/* insight */}
                    <div className="min-w-0" dir="rtl">
                      <div
                        className="truncate tight-he text-[12px] text-neutral-200"
                        title={row.primaryInsight.title}
                      >
                        {row.primaryInsight.title}
                      </div>
                      {row.supporting.length > 0 && (
                        <div
                          dir="ltr"
                          className="mt-[2px] flex items-center gap-1 term-mono text-[9px] tracking-[0.05em] text-neutral-600"
                        >
                          <span className="text-neutral-500">
                            +{row.supporting.length} signal
                            {row.supporting.length > 1 ? "s" : ""}
                          </span>
                          {row.supporting.slice(0, 3).map((s, i) => {
                            const sc = CATEGORY_STYLE[s.category];
                            return (
                              <span key={i} className="flex items-center gap-[3px]">
                                <span className="text-neutral-700">·</span>
                                <span
                                  className={`h-[4px] w-[4px] ${sc?.dot ?? "bg-neutral-500"}`}
                                />
                                <span className="text-neutral-500">
                                  {sc?.code ?? s.category.slice(0, 6)}
                                </span>
                                <span className="text-neutral-700">
                                  [{s.score.toString().padStart(2, "0")}]
                                </span>
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* score */}
                    <div className="flex items-center justify-end gap-2">
                      <div className="relative h-[14px] w-[28px] border border-neutral-800">
                        <div
                          className={`absolute inset-y-0 left-0 ${
                            row.primaryInsight.score >= 85
                              ? "bg-emerald-400"
                              : row.primaryInsight.score >= 70
                                ? "bg-cyan-400"
                                : "bg-amber-400"
                          }`}
                          style={{
                            width: `${row.primaryInsight.score}%`,
                            opacity: 0.85,
                          }}
                        />
                      </div>
                      <span
                        className={`term-mono text-[13px] font-medium tabular-nums ${scoreColor(row.primaryInsight.score)}`}
                      >
                        {row.primaryInsight.score.toString().padStart(2, "0")}
                      </span>
                    </div>

                    {/* value */}
                    <div className="flex items-baseline gap-1">
                      <span className="term-mono text-[10px] text-neutral-600">
                        ₪
                      </span>
                      <span className="term-mono text-[12px] tabular-nums text-neutral-100">
                        {valueNum}
                      </span>
                    </div>

                    {/* phone */}
                    <div className="text-right term-mono text-[11px] tabular-nums text-neutral-400">
                      {row.phone}
                    </div>
                  </li>
                );
              })}

              {/* ghost rows to imply a longer queue */}
              {Array.from({ length: 3 }).map((_, i) => (
                <li
                  key={`ghost-${i}`}
                  className="grid items-center gap-2 border-b border-neutral-900 px-3 py-[10px] opacity-40"
                  style={{
                    gridTemplateColumns:
                      "34px 44px minmax(0,1.1fr) 96px minmax(0,1.6fr) 68px 120px 110px",
                  }}
                >
                  <span className="term-mono text-[12px] text-neutral-700 tabular-nums">
                    {(STUDIO_QUEUE.length + i + 1).toString().padStart(2, "0")}
                  </span>
                  <span className="term-mono text-[9px] text-neutral-700">
                    ░░░░░░
                  </span>
                  <span className="term-mono text-[11px] text-neutral-800">
                    ████████ █████
                  </span>
                  <span className="term-mono text-[11px] text-neutral-800">
                    ██ / ██ pol
                  </span>
                  <span className="term-mono text-[11px] text-neutral-800">
                    ████████████████████
                  </span>
                  <span className="text-right term-mono text-[11px] text-neutral-700">
                    ██
                  </span>
                  <span className="term-mono text-[11px] text-neutral-700">
                    ₪ ███,███
                  </span>
                  <span className="text-right term-mono text-[11px] text-neutral-700">
                    ███-███████
                  </span>
                </li>
              ))}
            </ul>

            {/* table footer */}
            <div className="flex items-center justify-between bg-[#0B0D12] px-3 py-[6px] term-mono text-[10px] tracking-[0.08em] text-neutral-500">
              <div className="flex items-center gap-3">
                <span>
                  <span className="text-neutral-600">shown </span>
                  <span className="text-neutral-300 tabular-nums">
                    {STUDIO_QUEUE.length.toString().padStart(2, "0")}
                  </span>
                  <span className="text-neutral-600"> of </span>
                  <span className="text-neutral-300 tabular-nums">20</span>
                </span>
                <span className="text-neutral-700">│</span>
                <span>
                  <span className="text-neutral-600">avg_score </span>
                  <span className="text-emerald-300 tabular-nums">
                    {(
                      STUDIO_QUEUE.reduce(
                        (a, r) => a + r.primaryInsight.score,
                        0,
                      ) / STUDIO_QUEUE.length
                    ).toFixed(1)}
                  </span>
                </span>
                <span className="text-neutral-700">│</span>
                <span>
                  <span className="text-neutral-600">total_value </span>
                  <span className="text-neutral-200 tabular-nums">
                    ₪3.11M
                  </span>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <kbd className="border border-neutral-700 bg-[#12161F] px-[6px] py-[1px] text-[10px] tracking-[0.1em] text-neutral-400">
                  G G
                </kbd>
                <span>top</span>
                <span className="text-neutral-700">│</span>
                <kbd className="border border-neutral-700 bg-[#12161F] px-[6px] py-[1px] text-[10px] tracking-[0.1em] text-neutral-400">
                  /
                </kbd>
                <span>filter</span>
              </div>
            </div>
          </div>

          {/* ===== RIGHT RAIL: EVENT LOG ===== */}
          <aside className="flex flex-col gap-4" dir="ltr">
            {/* distribution panel */}
            <div className="relative border border-neutral-800 bg-[#0D1117]">
              <Corners />
              <PanelHeader title="CATEGORY_DIST" subtitle="today" />
              <div className="flex flex-col gap-[6px] px-3 py-3">
                {[
                  {
                    k: "AGE_MILESTONE",
                    n: 7,
                    pct: 35,
                  },
                  { k: "HIGH_VALUE", n: 5, pct: 25 },
                  { k: "COST_OPTIMIZATION", n: 4, pct: 20 },
                  { k: "COVERAGE_GAP", n: 3, pct: 15 },
                  { k: "SERVICE", n: 1, pct: 5 },
                ].map((d) => {
                  const c = CATEGORY_STYLE[d.k];
                  return (
                    <div key={d.k} className="flex items-center gap-2">
                      <span className={`h-[7px] w-[7px] ${c.dot}`} />
                      <span
                        className={`term-mono text-[10px] tracking-[0.08em] ${c.text} w-[64px]`}
                      >
                        {c.code}
                      </span>
                      <div className="relative h-[8px] flex-1 border border-neutral-800 bg-[#0B0D12]">
                        <div
                          className={`absolute inset-y-0 left-0 ${c.dot}`}
                          style={{ width: `${d.pct}%`, opacity: 0.7 }}
                        />
                      </div>
                      <span className="term-mono text-[10px] tabular-nums text-neutral-400">
                        {d.n.toString().padStart(2, "0")}
                      </span>
                      <span className="term-mono text-[10px] tabular-nums text-neutral-600">
                        {d.pct.toString().padStart(2, "0")}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* system log */}
            <div className="relative flex flex-1 flex-col border border-neutral-800 bg-[#0D1117]">
              <Corners />
              <PanelHeader title="SYS_LOG" subtitle="live · tail -f" live />
              <ol className="flex flex-col gap-[4px] px-3 py-3 term-mono text-[10px] leading-[1.55] text-neutral-400">
                {SYS_LOG.map((entry, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="shrink-0 tabular-nums text-neutral-600">
                      {entry.t}
                    </span>
                    <span
                      className={`shrink-0 tracking-[0.08em] ${
                        entry.level === "OK"
                          ? "text-emerald-400"
                          : entry.level === "WARN"
                            ? "text-amber-400"
                            : entry.level === "ERR"
                              ? "text-rose-400"
                              : "text-cyan-300"
                      }`}
                    >
                      {entry.level.padEnd(4, " ")}
                    </span>
                    <span className="truncate text-neutral-500">
                      {entry.msg}
                    </span>
                  </li>
                ))}
                <li className="flex gap-2 text-emerald-300">
                  <span className="tabular-nums text-neutral-600">
                    {ts}
                  </span>
                  <span>$</span>
                  <span>
                    awaiting_input
                    <span
                      className={`blink-cursor ${cursorOn ? "opacity-100" : "opacity-0"}`}
                    >
                      █
                    </span>
                  </span>
                </li>
              </ol>
            </div>

            {/* keybindings cheat sheet */}
            <div className="relative border border-neutral-800 bg-[#0D1117]">
              <Corners />
              <PanelHeader title="KEYS" subtitle="ref" />
              <dl className="grid grid-cols-2 gap-x-3 gap-y-[6px] px-3 py-3 term-mono text-[10px] text-neutral-400">
                {[
                  ["J / K", "row next/prev"],
                  ["⏎", "open customer"],
                  ["C", "call"],
                  ["A", "approve"],
                  ["D", "defer"],
                  ["X", "dismiss"],
                  ["⌘ K", "command bar"],
                  ["⌘ /", "filter"],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between">
                    <kbd className="border border-neutral-700 bg-[#12161F] px-[6px] py-[1px] text-[10px] tracking-[0.08em] text-neutral-300">
                      {k}
                    </kbd>
                    <span className="text-neutral-500">{v}</span>
                  </div>
                ))}
              </dl>
            </div>
          </aside>
        </section>

        {/* ============ FOOTER STATUS BAR ============ */}
        <footer
          className="mt-4 flex items-center justify-between border border-neutral-800 bg-[#0D1117] px-3 py-[6px] term-mono text-[10px] tracking-[0.08em] text-neutral-500"
          dir="ltr"
        >
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-2">
              <span className="h-[6px] w-[6px] bg-emerald-400 shadow-[0_0_8px_rgba(0,212,160,0.7)]" />
              <span className="text-emerald-300">OPERATIONAL</span>
            </span>
            <span className="text-neutral-700">│</span>
            <span>
              <span className="text-neutral-600">agent </span>
              <span className="text-neutral-300">רפי_כהן</span>
            </span>
            <span className="text-neutral-700">│</span>
            <span>
              <span className="text-neutral-600">role </span>
              <span className="text-neutral-300">BROKER/OWNER</span>
            </span>
            <span className="text-neutral-700">│</span>
            <span>
              <span className="text-neutral-600">tenant </span>
              <span className="text-neutral-300">cohen_ins_001</span>
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span>
              <span className="text-neutral-600">p99 </span>
              <span className="text-neutral-300 tabular-nums">128ms</span>
            </span>
            <span className="text-neutral-700">│</span>
            <span>
              <span className="text-neutral-600">mem </span>
              <span className="text-neutral-300 tabular-nums">412MB</span>
            </span>
            <span className="text-neutral-700">│</span>
            <span>
              <span className="text-neutral-600">build </span>
              <span className="text-neutral-300">insagent@3.2.1-e4f1a7b</span>
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
}

// ========================================================================
// subcomponents
// ========================================================================

function StatusChip({
  label,
  value,
  tone,
  pulse = false,
}: {
  label: string;
  value: string;
  tone: "good" | "warn" | "bad" | "neutral";
  pulse?: boolean;
}) {
  const toneText =
    tone === "good"
      ? "text-emerald-300"
      : tone === "warn"
        ? "text-amber-300"
        : tone === "bad"
          ? "text-rose-300"
          : "text-neutral-300";
  const dot =
    tone === "good"
      ? "bg-emerald-400"
      : tone === "warn"
        ? "bg-amber-400"
        : tone === "bad"
          ? "bg-rose-400"
          : "bg-neutral-500";
  return (
    <span className="inline-flex items-center gap-[6px] border border-neutral-800 bg-[#0D1117] px-[8px] py-[4px] term-mono text-[10px] tracking-[0.08em]">
      {pulse ? (
        <span className="relative flex h-[6px] w-[6px]">
          <span
            className={`absolute inset-0 animate-ping ${dot} opacity-80`}
          />
          <span className={`relative h-[6px] w-[6px] ${dot}`} />
        </span>
      ) : (
        <span className={`h-[6px] w-[6px] ${dot}`} />
      )}
      <span className="text-neutral-500">{label}:</span>
      <span className={toneText}>{value}</span>
    </span>
  );
}

function Metric({
  label,
  value,
  sub,
  delta,
  deltaTone,
  accent,
  divider = false,
}: {
  label: string;
  value: string;
  sub: string;
  delta: string;
  deltaTone: "good" | "warn" | "bad" | "neutral";
  accent: "emerald" | "cyan" | "amber" | "rose";
  divider?: boolean;
}) {
  const accentClass =
    accent === "emerald"
      ? "bg-emerald-400 shadow-[0_0_20px_rgba(0,212,160,0.35)]"
      : accent === "cyan"
        ? "bg-cyan-400 shadow-[0_0_20px_rgba(56,189,248,0.3)]"
        : accent === "amber"
          ? "bg-amber-400 shadow-[0_0_20px_rgba(251,191,36,0.3)]"
          : "bg-rose-400 shadow-[0_0_20px_rgba(244,63,94,0.3)]";
  const deltaClass =
    deltaTone === "good"
      ? "text-emerald-300"
      : deltaTone === "warn"
        ? "text-amber-300"
        : deltaTone === "bad"
          ? "text-rose-300"
          : "text-neutral-400";
  return (
    <div
      className={`relative px-4 py-3 ${
        divider ? "border-l border-neutral-800" : ""
      }`}
    >
      <div className="flex items-center gap-2">
        <span className={`h-[6px] w-[6px] ${accentClass}`} />
        <span className="term-mono text-[10px] tracking-[0.12em] text-neutral-500">
          {label}
        </span>
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span
          className="term-mono text-[28px] font-medium tabular-nums text-neutral-100"
          style={{ fontFeatureSettings: "'tnum','zero'" }}
        >
          {value}
        </span>
        <span className="term-mono text-[10px] tracking-[0.08em] text-neutral-600">
          {sub}
        </span>
      </div>
      <div
        className={`mt-1 term-mono text-[10px] tracking-[0.08em] ${deltaClass}`}
      >
        {delta}
      </div>
    </div>
  );
}

function PanelHeader({
  title,
  subtitle,
  live = false,
}: {
  title: string;
  subtitle?: string;
  live?: boolean;
}) {
  return (
    <div className="flex items-center justify-between border-b border-neutral-800 bg-[#0B0D12] px-3 py-[6px] term-mono text-[10px] tracking-[0.12em]">
      <div className="flex items-center gap-2">
        <span
          className={`h-[6px] w-[6px] ${
            live
              ? "bg-emerald-400 shadow-[0_0_8px_rgba(0,212,160,0.7)]"
              : "bg-neutral-600"
          }`}
        />
        <span className="text-neutral-300">{title}</span>
      </div>
      {subtitle && (
        <span className="text-neutral-600">
          {live && (
            <span className="mr-2 inline-block h-[6px] w-[6px] animate-pulse bg-rose-400" />
          )}
          {subtitle}
        </span>
      )}
    </div>
  );
}

// ========================================================================
// mock event log (static, rendered in LTR)
// ========================================================================

const SYS_LOG: { t: string; level: "OK" | "WARN" | "ERR" | "INFO"; msg: string }[] = [
  { t: "09:12:04", level: "OK", msg: "queue.rebuild() → 20 rows in 1.12s" },
  { t: "09:12:04", level: "INFO", msg: "model:rank_v3.2.1 loaded [cold]" },
  { t: "09:14:38", level: "OK", msg: "insight.promote id=4419 → queue[#01]" },
  { t: "09:21:11", level: "WARN", msg: "signal drift detected cat=COV-GAP +0.04" },
  { t: "09:28:02", level: "OK", msg: "approval.submit by=רפי n=3" },
  { t: "09:41:55", level: "INFO", msg: "cron:refresh_prices OK 412 symbols" },
  { t: "10:02:17", level: "OK", msg: "call.completed cust=דוד_כהן dur=11m" },
  { t: "10:14:40", level: "INFO", msg: "embedding.cache hit_rate=94.8%" },
  { t: "10:33:09", level: "WARN", msg: "rate_limit openai 8/60s → backoff 2s" },
  { t: "10:49:22", level: "OK", msg: "queue.promote id=8821 reason=AGE-MS" },
  { t: "11:02:00", level: "INFO", msg: "lease renewed tenant=cohen_ins_001" },
];
