/* ============================================================
   InsAgent — Editorial Variant
   ------------------------------------------------------------
   Design references:
     · The Economist — leader articles, masthead, rule lines
     · Hermès annual report — generous white space, drop caps,
       the quiet dignity of monochrome with a single accent
     · The Financial Times Weekend — broadsheet grid, big numbers
     · Bloomberg Businessweek — feature spreads, oversized figures
       as typographic objects, not "data viz"
   ------------------------------------------------------------
   Rules:
     · No rounded corners. Squared everything. (border-radius: 0)
     · No soft shadows. Only 1px hairlines carry structure.
     · Serif display (Frank Ruhl Libre) for headlines & numerals.
     · Sans (Heebo) for body.
     · Off-white #FAF7F2, near-black #0A0A0A.
     · One accent: burnt amber #D97706 — used for one mark per
       screen, like a printer's fleuron.
   ============================================================ */

import { Frank_Ruhl_Libre } from "next/font/google";
import {
  STUDIO_QUEUE,
  STUDIO_STATS,
  type StudioQueueEntry,
} from "../_shared/mock-queue";

const frankRuhl = Frank_Ruhl_Libre({
  subsets: ["hebrew", "latin"],
  weight: ["300", "500", "700", "900"],
  display: "swap",
  variable: "--font-frank-ruhl",
});

/* ------------------------------------------------------------
   Editorial palette — locked to the page, not the design system
   ------------------------------------------------------------ */
const INK = "#0A0A0A";
const PAPER = "#FAF7F2";
const EMBER = "#D97706";
const MUTED = "#6B6660";

/* ------------------------------------------------------------
   Masthead meta — issue number derived from date to feel real
   ------------------------------------------------------------ */
function getIssueMeta() {
  const now = new Date("2026-04-17T08:00:00+03:00");
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const weekOfYear = Math.ceil(
    ((now.getTime() - startOfYear.getTime()) / 86_400_000 + startOfYear.getDay() + 1) / 7,
  );
  const dateHe = new Intl.DateTimeFormat("he-IL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(now);
  const volumeYear = now.getFullYear() - 2023; // founded 2024 → Vol. II in 2026
  return {
    dateHe,
    issue: String(weekOfYear).padStart(3, "0"),
    volume: ["I", "II", "III", "IV", "V"][Math.max(0, volumeYear - 1)] ?? "I",
  };
}

/* ------------------------------------------------------------
   Number formatting — lining, tabular, LTR island in RTL flow
   ------------------------------------------------------------ */
const nf = new Intl.NumberFormat("en-US");

function LiningNumber({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={className}
      style={{
        direction: "ltr",
        unicodeBidi: "isolate",
        fontVariantNumeric: "lining-nums tabular-nums",
        fontFeatureSettings: '"lnum" 1, "tnum" 1',
      }}
    >
      {children}
    </span>
  );
}

/* ------------------------------------------------------------
   Hairline — a proper editorial rule.
   `weight`: "hair" = 1px, "bold" = 2px, "double" = 1+3+1 stack
   ------------------------------------------------------------ */
function Rule({
  weight = "hair",
  className = "",
}: {
  weight?: "hair" | "bold" | "double";
  className?: string;
}) {
  if (weight === "double") {
    return (
      <div className={className} aria-hidden>
        <div style={{ borderTop: `1px solid ${INK}` }} />
        <div style={{ height: 3 }} />
        <div style={{ borderTop: `1px solid ${INK}` }} />
      </div>
    );
  }
  return (
    <div
      aria-hidden
      className={className}
      style={{
        borderTop: `${weight === "bold" ? 2 : 1}px solid ${INK}`,
      }}
    />
  );
}

/* ------------------------------------------------------------
   Roman numerals for article numbering — editorial ornament
   ------------------------------------------------------------ */
function toRoman(n: number): string {
  const map: [number, string][] = [
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"],
  ];
  let out = "";
  let rem = n;
  for (const [value, glyph] of map) {
    while (rem >= value) {
      out += glyph;
      rem -= value;
    }
  }
  return out;
}

/* ------------------------------------------------------------
   Section labels — the tiny all-caps kickers that precede a
   headline in a well-typeset magazine. Letter-spaced, small.
   ------------------------------------------------------------ */
function Kicker({
  children,
  color = INK,
  className = "",
}: {
  children: React.ReactNode;
  color?: string;
  className?: string;
}) {
  return (
    <div
      className={className}
      style={{
        color,
        fontSize: 10.5,
        letterSpacing: "0.22em",
        fontWeight: 600,
        textTransform: "none", // Hebrew has no case; we rely on spacing
      }}
    >
      {children}
    </div>
  );
}

/* ============================================================
   Article treatment — one queue entry as an editorial feature
   ============================================================ */
function QueueArticle({ entry }: { entry: StudioQueueEntry }) {
  const isLead = entry.rank === 1;

  return (
    <article
      className="group relative grid gap-x-8 py-10"
      style={{
        gridTemplateColumns: "72px 1fr 280px",
      }}
    >
      {/* Roman numeral gutter — huge, quiet */}
      <div
        className={frankRuhl.className}
        style={{
          color: INK,
          opacity: 0.9,
          fontSize: isLead ? 56 : 44,
          lineHeight: 1,
          fontWeight: 300,
          letterSpacing: "-0.02em",
          direction: "ltr",
          fontFeatureSettings: '"lnum" 1',
        }}
      >
        {toRoman(entry.rank)}
      </div>

      {/* Body column */}
      <div className="min-w-0">
        <Kicker color={EMBER} className={frankRuhl.className}>
          {entry.reasonCategory}
        </Kicker>

        {/* Headline — the customer name, set like a byline-as-headline */}
        <h2
          className={frankRuhl.className}
          style={{
            fontSize: isLead ? 48 : 38,
            lineHeight: 1.02,
            fontWeight: isLead ? 700 : 500,
            letterSpacing: "-0.015em",
            color: INK,
            marginTop: 10,
          }}
        >
          {entry.customerName}
          <span
            style={{
              fontWeight: 300,
              color: MUTED,
              fontStyle: "italic",
              fontSize: isLead ? 28 : 24,
            }}
          >
            {" "}— בן{" "}
            <LiningNumber>{entry.age}</LiningNumber>
          </span>
        </h2>

        {/* Pull-quote / standfirst with drop-cap on the lead article.
            Editorial practice: bold lede explaining why the piece exists. */}
        <div className="relative mt-6">
          <div
            aria-hidden
            style={{
              position: "absolute",
              right: 0,
              top: 6,
              width: 3,
              height: "calc(100% - 12px)",
              background: EMBER,
            }}
          />
          <p
            className={`${frankRuhl.className} editorial-lede`}
            data-lead={isLead || undefined}
            style={{
              fontSize: isLead ? 22 : 19,
              lineHeight: 1.45,
              fontWeight: 300,
              color: INK,
              paddingInlineStart: 20,
              fontStyle: "italic",
            }}
          >
            <span
              style={{
                fontWeight: 600,
                fontStyle: "normal",
                letterSpacing: "0.14em",
                fontSize: 11,
                color: EMBER,
                marginInlineEnd: 10,
                verticalAlign: "0.15em",
              }}
            >
              למה היום ·
            </span>
            {entry.whyToday}
          </p>
        </div>

        {/* Primary insight — set as the body paragraph of an article */}
        <div className="mt-8">
          <Kicker>תובנה ראשית</Kicker>
          <p
            style={{
              fontSize: 16,
              lineHeight: 1.55,
              color: INK,
              marginTop: 8,
              fontWeight: 400,
            }}
          >
            {entry.primaryInsight.title}
          </p>
        </div>

        {/* Supporting insights — set as a list with leaders, like a TOC */}
        {entry.supporting.length > 0 && (
          <div className="mt-6">
            <Kicker>תובנות משלימות</Kicker>
            <ul className="mt-3 space-y-2.5">
              {entry.supporting.map((s, i) => (
                <li
                  key={i}
                  className="flex items-baseline gap-3"
                  style={{ fontSize: 14, color: INK }}
                >
                  <span
                    className={frankRuhl.className}
                    style={{
                      fontSize: 12,
                      color: MUTED,
                      minWidth: 16,
                      fontFeatureSettings: '"lnum" 1',
                    }}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span
                    aria-hidden
                    style={{
                      flex: 1,
                      borderBottom: `1px dotted ${INK}`,
                      opacity: 0.25,
                      transform: "translateY(-4px)",
                    }}
                  />
                  <span style={{ fontWeight: 400 }}>{s.title}</span>
                  <span
                    style={{
                      fontSize: 11,
                      color: MUTED,
                      letterSpacing: "0.1em",
                    }}
                  >
                    <LiningNumber>{s.score}</LiningNumber>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Right rail — the "infobox" of a feature article */}
      <aside
        className="relative"
        style={{
          borderInlineStart: `1px solid ${INK}`,
          paddingInlineStart: 24,
        }}
      >
        <Kicker>נתונים בתיק</Kicker>
        <Rule className="mt-2 mb-5" />

        <dl className="space-y-5">
          <div>
            <dt
              className={frankRuhl.className}
              style={{ fontSize: 11, color: MUTED, letterSpacing: "0.08em" }}
            >
              היקף חיסכון
            </dt>
            <dd
              className={frankRuhl.className}
              style={{
                fontSize: 32,
                lineHeight: 1,
                color: INK,
                fontWeight: 500,
                marginTop: 4,
                letterSpacing: "-0.01em",
              }}
            >
              <LiningNumber>{entry.savings}</LiningNumber>
            </dd>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <dt
                className={frankRuhl.className}
                style={{ fontSize: 11, color: MUTED, letterSpacing: "0.08em" }}
              >
                פוליסות
              </dt>
              <dd
                className={frankRuhl.className}
                style={{
                  fontSize: 24,
                  lineHeight: 1,
                  color: INK,
                  fontWeight: 500,
                  marginTop: 4,
                }}
              >
                <LiningNumber>{entry.policyCount}</LiningNumber>
              </dd>
            </div>
            <div>
              <dt
                className={frankRuhl.className}
                style={{ fontSize: 11, color: MUTED, letterSpacing: "0.08em" }}
              >
                ציון תובנה
              </dt>
              <dd
                className={frankRuhl.className}
                style={{
                  fontSize: 24,
                  lineHeight: 1,
                  color: EMBER,
                  fontWeight: 500,
                  marginTop: 4,
                }}
              >
                <LiningNumber>{entry.primaryInsight.score}</LiningNumber>
              </dd>
            </div>
          </div>

          <div>
            <dt
              className={frankRuhl.className}
              style={{ fontSize: 11, color: MUTED, letterSpacing: "0.08em" }}
            >
              ליצירת קשר
            </dt>
            <dd
              style={{
                fontSize: 14,
                color: INK,
                marginTop: 4,
                fontVariantNumeric: "lining-nums tabular-nums",
                fontFeatureSettings: '"lnum" 1, "tnum" 1',
              }}
            >
              <LiningNumber>{entry.phone}</LiningNumber>
            </dd>
          </div>
        </dl>

        <div className="mt-8">
          <a
            href="#"
            className="editorial-cta inline-block"
            style={{
              fontSize: 11,
              letterSpacing: "0.24em",
              fontWeight: 600,
              color: INK,
              borderBottom: `1px solid ${INK}`,
              paddingBottom: 3,
            }}
          >
            להמשך הכתבה ←
          </a>
        </div>
      </aside>
    </article>
  );
}

/* ============================================================
   Page
   ============================================================ */
export default function EditorialStudioPage() {
  const meta = getIssueMeta();

  return (
    <div
      className={frankRuhl.variable}
      style={{
        background: PAPER,
        color: INK,
        minHeight: "100%",
        margin: "-2rem",
        padding: "3rem 3.5rem 4rem",
        /* Very subtle paper-grain: inline SVG noise, 3% opacity.
           Hermès reports use an actual printed tooth; we fake it. */
        backgroundImage: `url("data:image/svg+xml;utf8,${encodeURIComponent(
          `<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.04 0 0 0 0 0.04 0 0 0 0 0.04 0 0 0 0.06 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>`,
        )}")`,
        backgroundRepeat: "repeat",
      }}
    >
      {/* Scoped styles — drop caps, hover behavior, print feel.
          We isolate with `.editorial-root` to keep the rest of
          the app untouched. */}
      <style>{`
        .editorial-root { font-family: var(--font-heebo), sans-serif; }

        .editorial-lede[data-lead]::first-letter {
          font-family: var(--font-frank-ruhl), serif;
          float: right;
          font-size: 4.2em;
          line-height: 0.85;
          font-weight: 700;
          font-style: normal;
          margin-inline-start: 0.08em;
          margin-inline-end: 0;
          margin-top: 0.06em;
          color: ${INK};
          padding-inline-start: 0.12em;
        }

        .editorial-cta {
          transition: color 160ms linear, border-color 160ms linear;
        }
        .editorial-cta:hover {
          color: ${EMBER};
          border-color: ${EMBER};
        }

        .editorial-nav a {
          transition: color 160ms linear;
        }
        .editorial-nav a:hover {
          color: ${EMBER};
        }

        .editorial-stat-col + .editorial-stat-col {
          border-inline-start: 1px solid ${INK};
        }

        /* A print-shop colophon: tiny pinstripe under the masthead */
        .editorial-pinstripe {
          background-image: repeating-linear-gradient(
            90deg,
            ${INK} 0,
            ${INK} 1px,
            transparent 1px,
            transparent 4px
          );
          height: 4px;
        }
      `}</style>

      <div className="editorial-root max-w-[1400px] mx-auto">
        {/* =================================================
            MASTHEAD
            ================================================= */}
        <header>
          {/* Top meta bar — tiny, all-caps, like a publication date line */}
          <div
            className="flex items-center justify-between"
            style={{
              fontSize: 10.5,
              letterSpacing: "0.2em",
              color: INK,
              fontWeight: 600,
            }}
          >
            <span>{meta.dateHe}</span>
            <span>
              כרך {meta.volume} · גיליון{" "}
              <LiningNumber>№ {meta.issue}</LiningNumber>
            </span>
            <span>מהדורה יומית · ירושלים—תל אביב</span>
          </div>

          <Rule className="mt-3" />
          <div className="editorial-pinstripe mt-[3px]" />

          {/* Title block */}
          <div
            className="grid items-end gap-8 pt-6 pb-5"
            style={{ gridTemplateColumns: "1fr auto 1fr" }}
          >
            <div>
              <div
                className={frankRuhl.className}
                style={{
                  fontSize: 12,
                  letterSpacing: "0.28em",
                  color: MUTED,
                  fontWeight: 500,
                }}
              >
                THE INSURANCE INTELLIGENCE QUARTERLY
              </div>
              <div
                className={frankRuhl.className}
                style={{
                  fontSize: 11,
                  color: INK,
                  marginTop: 8,
                  fontStyle: "italic",
                }}
              >
                &ldquo;לא עוד ניחושים. נתונים שמדברים.&rdquo;
              </div>
            </div>

            <h1
              className={frankRuhl.className}
              style={{
                fontSize: 104,
                lineHeight: 0.9,
                fontWeight: 900,
                letterSpacing: "-0.035em",
                textAlign: "center",
                color: INK,
              }}
            >
              InsAgent
              <span
                aria-hidden
                style={{
                  display: "inline-block",
                  width: 14,
                  height: 14,
                  background: EMBER,
                  transform: "translateY(-0.55em)",
                  marginInlineStart: 10,
                }}
              />
            </h1>

            <div
              style={{
                textAlign: "end",
                fontSize: 11,
                letterSpacing: "0.12em",
                color: MUTED,
              }}
            >
              <div className={frankRuhl.className} style={{ fontWeight: 500 }}>
                מהדורה מקצועית · סוכני ביטוח
              </div>
              <div style={{ marginTop: 6 }}>
                עודכן: {STUDIO_STATS.lastRebuild}
              </div>
            </div>
          </div>

          <Rule weight="double" />

          {/* Main stat line — the "this issue at a glance" strapline */}
          <div
            className="py-7 flex items-baseline gap-6"
            style={{ fontSize: 15 }}
          >
            <span
              className={frankRuhl.className}
              style={{
                fontSize: 15,
                fontWeight: 500,
                letterSpacing: "0.14em",
                color: EMBER,
              }}
            >
              היום במהדורה —
            </span>
            <p
              className={frankRuhl.className}
              style={{
                fontSize: 19,
                lineHeight: 1.4,
                color: INK,
                fontStyle: "italic",
                fontWeight: 300,
                flex: 1,
              }}
            >
              <LiningNumber>{STUDIO_STATS.queueToday}</LiningNumber> לקוחות
              בתור לטיפול מיידי · <LiningNumber>{nf.format(STUDIO_STATS.totalInsights)}</LiningNumber>{" "}
              תובנות פעילות במערכת · <LiningNumber>{STUDIO_STATS.pendingApprovals}</LiningNumber>{" "}
              פריטים ממתינים לאישור המשרד · הפקת התובנות הושלמה{" "}
              {STUDIO_STATS.lastRebuild}.
            </p>
          </div>

          <Rule weight="bold" />
        </header>

        {/* =================================================
            STATS STRIP — big numbers, vertical rules between
            ================================================= */}
        <section className="grid grid-cols-5 py-10">
          {[
            { label: "לקוחות במעקב", value: nf.format(STUDIO_STATS.totalCustomers), suffix: "" },
            { label: "תובנות פעילות", value: nf.format(STUDIO_STATS.totalInsights), suffix: "" },
            { label: "בתור היום", value: nf.format(STUDIO_STATS.queueToday), suffix: "", accent: true },
            { label: "ממתינים לאישור", value: nf.format(STUDIO_STATS.pendingApprovals), suffix: "" },
            { label: "הושלמו היום", value: nf.format(STUDIO_STATS.completedToday), suffix: "" },
          ].map((stat, i) => (
            <div
              key={i}
              className="editorial-stat-col px-6 first:ps-0 last:pe-0"
              style={{ textAlign: "start" }}
            >
              <Kicker
                className={frankRuhl.className}
                color={stat.accent ? EMBER : MUTED}
              >
                {stat.label}
              </Kicker>
              <div
                className={frankRuhl.className}
                style={{
                  fontSize: 64,
                  lineHeight: 1,
                  fontWeight: 500,
                  color: stat.accent ? EMBER : INK,
                  letterSpacing: "-0.03em",
                  marginTop: 14,
                }}
              >
                <LiningNumber>{stat.value}</LiningNumber>
              </div>
            </div>
          ))}
        </section>

        <Rule weight="double" />

        {/* =================================================
            SECTION OPENER — like turning the page in a mag
            ================================================= */}
        <section
          className="grid gap-8 py-10 items-end"
          style={{ gridTemplateColumns: "1fr 340px" }}
        >
          <div>
            <Kicker color={EMBER} className={frankRuhl.className}>
              מדור ראשי · התור של היום
            </Kicker>
            <h2
              className={frankRuhl.className}
              style={{
                fontSize: 72,
                lineHeight: 0.95,
                fontWeight: 700,
                letterSpacing: "-0.028em",
                marginTop: 14,
              }}
            >
              חמש שיחות
              <br />
              שלא כדאי לדחות.
            </h2>
          </div>

          <div
            className="pt-2"
            style={{
              borderInlineStart: `1px solid ${INK}`,
              paddingInlineStart: 24,
            }}
          >
            <p
              style={{
                fontSize: 14,
                lineHeight: 1.6,
                color: INK,
                fontWeight: 400,
              }}
            >
              מערכת <b>InsAgent</b> עיבדה את כל תיקי המשרד מול נתוני הר הביטוח,
              דמי הניהול של הקרנות, וגילאי הלקוחות. אלה חמש הפניות שבהן
              הסיכוי להחזר ערך ללקוח — והכנסה למשרד — הוא הגבוה ביותר.
              מסודרות לפי דחיפות, לא לפי אלפביתא.
            </p>
            <Rule className="mt-5" />
            <div
              className={frankRuhl.className}
              style={{
                marginTop: 12,
                fontSize: 11,
                letterSpacing: "0.18em",
                color: MUTED,
                fontStyle: "italic",
              }}
            >
              מאת המערכת · תחקיר מערכת InsAgent
            </div>
          </div>
        </section>

        <Rule weight="bold" />

        {/* =================================================
            QUEUE — each entry rendered as an editorial piece
            ================================================= */}
        <section>
          {STUDIO_QUEUE.map((entry, i) => (
            <div key={entry.rank}>
              <QueueArticle entry={entry} />
              {i < STUDIO_QUEUE.length - 1 && <Rule />}
            </div>
          ))}
        </section>

        <Rule weight="double" className="mt-10" />

        {/* =================================================
            COLOPHON — the tiny closing block at the back of
            the book. Not a "footer" — a colophon.
            ================================================= */}
        <footer className="pt-8 pb-2">
          <div
            className="grid grid-cols-3 gap-10 items-start"
            style={{ fontSize: 11, letterSpacing: "0.12em", color: MUTED }}
          >
            <div>
              <Kicker>קולופון</Kicker>
              <p
                style={{
                  marginTop: 8,
                  fontSize: 12,
                  lineHeight: 1.6,
                  letterSpacing: 0,
                }}
              >
                המהדורה הזו נערכה ונסדרה אוטומטית על ידי מערכת{" "}
                <span className={frankRuhl.className} style={{ fontStyle: "italic" }}>
                  InsAgent
                </span>{" "}
                מתוך <LiningNumber>{nf.format(STUDIO_STATS.totalCustomers)}</LiningNumber>{" "}
                תיקי לקוח. אין באמור ייעוץ ביטוחי; ההחלטה — בידי הסוכן.
              </p>
            </div>

            <div className="editorial-nav text-center">
              <Kicker>ניווט</Kicker>
              <div style={{ marginTop: 8, fontSize: 12, letterSpacing: 0 }}>
                <a href="#" style={{ color: INK }}>
                  המהדורה
                </a>
                {" · "}
                <a href="#" style={{ color: INK }}>
                  הארכיון
                </a>
                {" · "}
                <a href="#" style={{ color: INK }}>
                  המדורים
                </a>
                {" · "}
                <a href="#" style={{ color: INK }}>
                  המערכת
                </a>
              </div>
            </div>

            <div style={{ textAlign: "end" }}>
              <Kicker>הדפסה</Kicker>
              <div
                className={frankRuhl.className}
                style={{
                  marginTop: 8,
                  fontSize: 12,
                  letterSpacing: 0,
                  fontStyle: "italic",
                }}
              >
                הוכן לדפוס · {meta.dateHe}
                <br />
                כרך {meta.volume} · № {meta.issue}
              </div>
            </div>
          </div>

          <Rule className="mt-10" />
          <div
            className="flex items-center justify-between pt-4"
            style={{ fontSize: 10.5, letterSpacing: "0.2em", color: MUTED }}
          >
            <span>
              © InsAgent <LiningNumber>{new Date().getFullYear()}</LiningNumber>{" "}
              · כל הזכויות שמורות
            </span>
            <span
              aria-hidden
              className={frankRuhl.className}
              style={{ color: EMBER, fontSize: 14 }}
            >
              ❦
            </span>
            <span>InsAgent · מהדורה מקצועית</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
