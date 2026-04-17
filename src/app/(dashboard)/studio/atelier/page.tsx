import { Frank_Ruhl_Libre, Cormorant_Garamond } from "next/font/google";
import { STUDIO_QUEUE, STUDIO_STATS } from "../_shared/mock-queue";

const frankRuhl = Frank_Ruhl_Libre({
  variable: "--font-frank-ruhl",
  subsets: ["hebrew", "latin"],
  weight: ["300", "400", "500", "700", "900"],
  display: "swap",
});

const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
});

// Eastern Arabic numerals for catalog flourishes
const EA = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
const toEastern = (n: number | string): string =>
  String(n).replace(/\d/g, (d) => EA[Number(d)]);

// Roman-style ordinal tag for placards (kept Latin for museum-label feel)
const pad2 = (n: number) => String(n).padStart(2, "0");

const PAPER = "#F5F0E8";
const PAPER_SHADE = "#EDE4D3";
const INK = "#2C1810";
const INK_SOFT = "#6B5344";
const INK_FAINT = "#A8937A";
const RUST = "#C2410C";
const RULE = "#D8C9AE";

export default function AtelierStudioPage() {
  return (
    <div
      dir="rtl"
      className={`${frankRuhl.variable} ${cormorant.variable} relative min-h-full -m-8 p-10 md:p-16`}
      style={{
        backgroundColor: PAPER,
        color: INK,
        fontFamily: "var(--font-heebo), system-ui, sans-serif",
      }}
    >
      {/* Paper texture overlay */}
      <PaperTexture />

      {/* Content */}
      <div className="relative mx-auto max-w-[1180px]">
        <Masthead />
        <Ledger />
        <QueueCatalog />
        <Archive />
        <Colophon />
      </div>
    </div>
  );
}

/* ─────────────────────────── Paper Texture ─────────────────────────── */

function PaperTexture() {
  return (
    <>
      <svg
        aria-hidden
        className="pointer-events-none fixed inset-0 h-full w-full"
        style={{ opacity: 0.22, mixBlendMode: "multiply" }}
      >
        <filter id="atelier-paper">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.85"
            numOctaves="2"
            stitchTiles="stitch"
          />
          <feColorMatrix
            type="matrix"
            values="0 0 0 0 0.17
                    0 0 0 0 0.09
                    0 0 0 0 0.06
                    0 0 0 0.35 0"
          />
        </filter>
        <rect width="100%" height="100%" filter="url(#atelier-paper)" />
      </svg>
      {/* Vignette warmth */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 40%, transparent 50%, rgba(120,80,30,0.08) 100%)",
        }}
      />
    </>
  );
}

/* ───────────────────────────── Masthead ─────────────────────────────── */

function Masthead() {
  return (
    <header className="pt-2 pb-10">
      {/* Tiny top rule with fleuron */}
      <div className="flex items-center gap-4 mb-10" style={{ color: INK_SOFT }}>
        <span
          className="text-[10px]"
          style={{
            letterSpacing: "0.3em",
            textTransform: "uppercase",
            fontFamily: "var(--font-cormorant)",
          }}
        >
          Insagent &nbsp;·&nbsp; Atelier Edition
        </span>
        <div className="flex-1">
          <div className="h-px w-full" style={{ background: RULE }} />
        </div>
        <span
          className="text-sm"
          style={{ color: INK_FAINT, fontFamily: "var(--font-cormorant)" }}
        >
          ❋
        </span>
        <div className="flex-1">
          <div className="h-px w-full" style={{ background: RULE }} />
        </div>
        <span
          className="text-[10px]"
          style={{
            letterSpacing: "0.3em",
            textTransform: "uppercase",
            fontFamily: "var(--font-cormorant)",
          }}
        >
          Sous la direction de רפי
        </span>
      </div>

      {/* Catalog line */}
      <div
        className="flex flex-wrap items-baseline justify-center gap-x-5 gap-y-2 mb-8"
        style={{ fontFamily: "var(--font-cormorant)" }}
      >
        <span
          className="text-[11px] tracking-[0.35em] uppercase"
          style={{ color: INK_SOFT }}
        >
          Catalogue
        </span>
        <Fleuron />
        <span className="text-sm italic" style={{ color: INK }}>
          גיליון {toEastern(37)}
        </span>
        <Fleuron />
        <span className="text-sm italic" style={{ color: INK }}>
          אפריל {toEastern(2026)}
        </span>
        <Fleuron />
        <span
          className="text-[11px] tracking-[0.35em] uppercase"
          style={{ color: INK_SOFT }}
        >
          יום ד׳
        </span>
      </div>

      {/* Title */}
      <h1
        className="text-center"
        style={{
          fontFamily: "var(--font-frank-ruhl)",
          fontWeight: 300,
          fontSize: "clamp(44px, 6vw, 78px)",
          letterSpacing: "-0.01em",
          lineHeight: 1.05,
          color: INK,
        }}
      >
        קטלוג הלקוחות של היום
      </h1>

      {/* Sub */}
      <p
        className="mt-5 text-center"
        style={{
          fontFamily: "var(--font-frank-ruhl)",
          fontStyle: "italic",
          fontSize: 18,
          color: INK_SOFT,
          letterSpacing: "0.01em",
        }}
      >
        חמישה פריטים נבחרים &nbsp; · &nbsp; סדר המוזיאון של המשרד &nbsp; · &nbsp; אסופה
        יומית
      </p>

      {/* Double rule divider */}
      <DoubleRule className="mt-12" />
    </header>
  );
}

/* ─────────────────────────── Ledger (stats) ──────────────────────────── */

function Ledger() {
  const s = STUDIO_STATS;
  return (
    <section className="py-12">
      <SectionLabel>הפתיח · Editorial</SectionLabel>

      <div className="mt-8 grid grid-cols-12 gap-8">
        {/* Prose paragraph — left-ish */}
        <div className="col-span-12 md:col-span-7">
          <p
            style={{
              fontFamily: "var(--font-frank-ruhl)",
              fontSize: 22,
              lineHeight: 1.75,
              color: INK,
              textAlign: "justify",
              fontWeight: 300,
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-frank-ruhl)",
                fontSize: 54,
                lineHeight: 0.85,
                float: "right",
                marginLeft: 8,
                marginTop: 6,
                color: RUST,
                fontWeight: 400,
              }}
            >
              ב
            </span>
            יומן היום{" "}
            <NumTick>{toEastern(s.queueToday)}</NumTick> פריטים נבחרים מתוך{" "}
            <NumTick>{toEastern(s.totalCustomers.toLocaleString("en-US"))}</NumTick>{" "}
            לקוחות פעילים.{" "}
            <em style={{ color: INK_SOFT }}>
              מאז הגיליון הקודם נוספו{" "}
              <NumTick>{toEastern(2)}</NumTick> לקוחות חדשים
            </em>
            , ונסרקו{" "}
            <NumTick>{toEastern(s.totalInsights.toLocaleString("en-US"))}</NumTick>{" "}
            תובנות בסך הכל. המנוע רוענן לאחרונה {s.lastRebuild}; ארבע פעולות
            ממתינות לאישור, ושלוש הושלמו מאז הבוקר.
          </p>
        </div>

        {/* Ledger column — right */}
        <aside className="col-span-12 md:col-span-5 md:pr-8 md:border-r md:border-solid" style={{ borderColor: RULE }}>
          <div className="md:pr-8">
            <LedgerRow k="בתור היום" v={toEastern(s.queueToday)} />
            <LedgerRow k="לאישור" v={toEastern(s.pendingApprovals)} emphasize />
            <LedgerRow k="הושלמו" v={toEastern(s.completedToday)} />
            <LedgerRow k="ריענון אחרון" v={s.lastRebuild} faint />
          </div>
        </aside>
      </div>

      <DoubleRule className="mt-14" />
    </section>
  );
}

function LedgerRow({
  k,
  v,
  emphasize,
  faint,
}: {
  k: string;
  v: string;
  emphasize?: boolean;
  faint?: boolean;
}) {
  return (
    <div
      className="flex items-baseline gap-4 py-3"
      style={{ borderTop: `1px dotted ${RULE}` }}
    >
      <span
        className="text-[11px]"
        style={{
          letterSpacing: "0.25em",
          textTransform: "uppercase",
          color: INK_SOFT,
          fontFamily: "var(--font-cormorant)",
          flex: "0 0 auto",
        }}
      >
        {k}
      </span>
      <span
        className="flex-1 self-end"
        style={{
          borderBottom: `1px dotted ${RULE}`,
          minWidth: 30,
          transform: "translateY(-4px)",
        }}
      />
      <span
        style={{
          fontFamily: "var(--font-frank-ruhl)",
          fontSize: emphasize ? 26 : 20,
          color: emphasize ? RUST : faint ? INK_SOFT : INK,
          fontStyle: faint ? "italic" : "normal",
          fontWeight: emphasize ? 500 : 400,
        }}
      >
        {v}
      </span>
    </div>
  );
}

/* ─────────────────────────── Queue Catalog ───────────────────────────── */

function QueueCatalog() {
  return (
    <section className="pb-4">
      <div className="flex items-baseline justify-between">
        <SectionLabel>הקטלוג · La Collection</SectionLabel>
        <span
          className="text-[11px]"
          style={{
            letterSpacing: "0.3em",
            textTransform: "uppercase",
            color: INK_FAINT,
            fontFamily: "var(--font-cormorant)",
          }}
        >
          Cinq pièces · חמש פריטים
        </span>
      </div>

      {/* Hero card */}
      <div className="mt-10">
        <QueueCard entry={STUDIO_QUEUE[0]} variant="hero" />
      </div>

      {/* Asymmetric 2-col rhythm */}
      <div className="mt-10 grid grid-cols-1 md:grid-cols-12 gap-10">
        <div className="md:col-span-7 md:col-start-1">
          <QueueCard entry={STUDIO_QUEUE[1]} variant="wide" />
        </div>
        <div className="md:col-span-5 md:col-start-8">
          <QueueCard entry={STUDIO_QUEUE[2]} variant="narrow" />
        </div>

        <div className="md:col-span-5 md:col-start-2">
          <QueueCard entry={STUDIO_QUEUE[3]} variant="narrow" />
        </div>
        <div className="md:col-span-6 md:col-start-7">
          <QueueCard entry={STUDIO_QUEUE[4]} variant="wide" />
        </div>
      </div>

      <DoubleRule className="mt-16" />
    </section>
  );
}

/* ───────────────────────────── Queue Card ────────────────────────────── */

type CardVariant = "hero" | "wide" | "narrow";

function QueueCard({
  entry,
  variant,
}: {
  entry: (typeof STUDIO_QUEUE)[number];
  variant: CardVariant;
}) {
  const isHero = variant === "hero";

  return (
    <article
      className="relative"
      style={{
        backgroundColor: PAPER_SHADE,
        padding: isHero ? "56px 56px 48px" : "40px 36px 36px",
        borderRadius: 2,
        boxShadow: "0 1px 0 rgba(0,0,0,0.04)",
      }}
    >
      {/* Corner tick marks — museum mount feel */}
      <CornerTicks />

      {/* Placard top strip */}
      <header className="flex items-start justify-between gap-6 pb-4">
        <div>
          <div
            className="mb-1"
            style={{
              fontFamily: "var(--font-cormorant)",
              fontSize: 11,
              letterSpacing: "0.4em",
              textTransform: "uppercase",
              color: INK_SOFT,
            }}
          >
            № {pad2(entry.rank)} &nbsp;·&nbsp; Pièce
          </div>
          <div
            style={{
              fontFamily: "var(--font-cormorant)",
              fontStyle: "italic",
              fontSize: 13,
              color: INK_FAINT,
            }}
          >
            {entry.reasonCategory}
          </div>
        </div>

        <ScoreBadge score={entry.primaryInsight.score} />
      </header>

      <ThinRule />

      {/* Name + metadata */}
      <div className="pt-6 pb-5">
        <h2
          style={{
            fontFamily: "var(--font-frank-ruhl)",
            fontWeight: 400,
            fontSize: isHero ? 64 : 42,
            lineHeight: 1.05,
            letterSpacing: "-0.01em",
            color: INK,
          }}
        >
          {entry.customerName}
        </h2>
        <p
          className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1"
          style={{
            fontFamily: "var(--font-frank-ruhl)",
            fontStyle: "italic",
            color: INK_SOFT,
            fontSize: isHero ? 17 : 15,
          }}
        >
          <span>גיל {toEastern(entry.age)}</span>
          <Flourish />
          <span>
            {toEastern(entry.policyCount)} פוליסות
          </span>
          <Flourish />
          <span>
            נכסים {toEastern(entry.savings.replace("₪", ""))} ₪
          </span>
          <Flourish />
          <span
            style={{
              fontFamily: "var(--font-cormorant)",
              fontStyle: "normal",
              letterSpacing: "0.08em",
            }}
          >
            {toEastern(entry.phone)}
          </span>
        </p>
      </div>

      <ThinRule />

      {/* Pull quote — why today */}
      <blockquote
        className="py-7"
        style={{
          fontFamily: "var(--font-frank-ruhl)",
          fontStyle: "italic",
          fontWeight: 300,
          fontSize: isHero ? 30 : 22,
          lineHeight: 1.45,
          color: INK,
          position: "relative",
          paddingInlineStart: 28,
        }}
      >
        <span
          aria-hidden
          style={{
            position: "absolute",
            insetInlineStart: 0,
            top: isHero ? 20 : 20,
            width: 3,
            height: isHero ? 60 : 44,
            background: RUST,
          }}
        />
        <span style={{ color: INK_FAINT, marginInlineEnd: 6 }}>״</span>
        {entry.whyToday}
        <span style={{ color: INK_FAINT, marginInlineStart: 6 }}>״</span>
      </blockquote>

      <ThinRule />

      {/* Primary insight — framed */}
      <div className="mt-7">
        <div
          className="mb-3 flex items-center gap-3"
          style={{ color: RUST }}
        >
          <span
            style={{
              fontFamily: "var(--font-cormorant)",
              fontSize: 11,
              letterSpacing: "0.35em",
              textTransform: "uppercase",
            }}
          >
            L'insight principal
          </span>
          <div className="flex-1 h-px" style={{ background: RUST, opacity: 0.35 }} />
          <span style={{ fontSize: 13 }}>✺</span>
        </div>

        <div
          className="relative"
          style={{
            border: `1px solid ${RUST}`,
            padding: "20px 24px",
            borderRadius: 2,
            backgroundColor: "rgba(194, 65, 12, 0.035)",
          }}
        >
          {/* Inner frame */}
          <div
            aria-hidden
            className="pointer-events-none absolute"
            style={{
              inset: 4,
              border: `1px solid ${RUST}`,
              opacity: 0.25,
              borderRadius: 1,
            }}
          />
          <div className="relative flex items-baseline justify-between gap-4">
            <h3
              style={{
                fontFamily: "var(--font-frank-ruhl)",
                fontWeight: 500,
                fontSize: isHero ? 26 : 20,
                lineHeight: 1.3,
                color: INK,
              }}
            >
              <span style={{ color: RUST, marginInlineEnd: 10 }}>❋</span>
              {entry.primaryInsight.title}
            </h3>
            <span
              className="flex-shrink-0"
              style={{
                fontFamily: "var(--font-cormorant)",
                fontStyle: "italic",
                fontSize: 12,
                letterSpacing: "0.15em",
                color: INK_SOFT,
                whiteSpace: "nowrap",
              }}
            >
              {entry.primaryInsight.category.toLowerCase().replace("_", " ")}
            </span>
          </div>
        </div>
      </div>

      {/* Supporting insights */}
      {entry.supporting.length > 0 && (
        <div className="mt-7">
          <div
            className="mb-4"
            style={{
              fontFamily: "var(--font-cormorant)",
              fontSize: 11,
              letterSpacing: "0.35em",
              textTransform: "uppercase",
              color: INK_SOFT,
            }}
          >
            מרגינליה &nbsp;·&nbsp; Notes
          </div>
          <ul className="space-y-3">
            {entry.supporting.map((s, i) => (
              <li
                key={i}
                className="flex items-baseline gap-3"
                style={{
                  fontFamily: "var(--font-frank-ruhl)",
                  fontSize: 16,
                  color: INK,
                  paddingBottom: 10,
                  borderBottom: `1px dotted ${RULE}`,
                }}
              >
                <span
                  style={{
                    color: RUST,
                    fontSize: 11,
                    transform: "translateY(-2px)",
                  }}
                >
                  ✦
                </span>
                <span className="flex-1">{s.title}</span>
                <span
                  style={{
                    fontFamily: "var(--font-cormorant)",
                    fontStyle: "italic",
                    color: INK_SOFT,
                    fontSize: 13,
                  }}
                >
                  {toEastern(s.score)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Footer actions — museum style */}
      <footer className="mt-8 flex items-center justify-between">
        <div
          style={{
            fontFamily: "var(--font-cormorant)",
            fontStyle: "italic",
            fontSize: 12,
            color: INK_FAINT,
          }}
        >
          acquisition №&nbsp;{toEastern(2026)}.{toEastern(pad2(entry.rank))}
          &nbsp;·&nbsp; on view
        </div>

        <div className="flex items-center gap-5">
          <AtelierLink>לדחות</AtelierLink>
          <span style={{ color: INK_FAINT }}>·</span>
          <AtelierLink primary>לפתוח תיק</AtelierLink>
        </div>
      </footer>
    </article>
  );
}

/* ──────────────────────────── Archive block ──────────────────────────── */

function Archive() {
  return (
    <section className="py-14">
      <SectionLabel>הארכיון · Archives</SectionLabel>
      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-12">
        <ArchiveCard
          title="סך הלקוחות"
          value={toEastern(STUDIO_STATS.totalCustomers.toLocaleString("en-US"))}
          sub="Inventaire total"
        />
        <ArchiveCard
          title="תובנות שנסרקו"
          value={toEastern(STUDIO_STATS.totalInsights.toLocaleString("en-US"))}
          sub="Annotations recensées"
        />
        <ArchiveCard
          title="גיליונות קודמים"
          value={`№ ${toEastern(36)} · ${toEastern(35)} · ${toEastern(34)}`}
          sub="Numéros précédents"
          isList
        />
      </div>
      <DoubleRule className="mt-14" />
    </section>
  );
}

function ArchiveCard({
  title,
  value,
  sub,
  isList,
}: {
  title: string;
  value: string;
  sub: string;
  isList?: boolean;
}) {
  return (
    <div>
      <div
        style={{
          fontFamily: "var(--font-cormorant)",
          fontSize: 11,
          letterSpacing: "0.3em",
          textTransform: "uppercase",
          color: INK_SOFT,
        }}
      >
        {title}
      </div>
      <div
        className="mt-3"
        style={{
          fontFamily: "var(--font-frank-ruhl)",
          fontWeight: 300,
          fontSize: isList ? 22 : 40,
          lineHeight: 1.1,
          color: INK,
          letterSpacing: "-0.01em",
        }}
      >
        {value}
      </div>
      <div
        className="mt-2"
        style={{
          fontFamily: "var(--font-cormorant)",
          fontStyle: "italic",
          fontSize: 13,
          color: INK_FAINT,
        }}
      >
        {sub}
      </div>
    </div>
  );
}

/* ────────────────────────────── Colophon ─────────────────────────────── */

function Colophon() {
  return (
    <footer className="pt-4 pb-8">
      <div className="flex items-center justify-center gap-5 mb-5" style={{ color: INK_FAINT }}>
        <span style={{ fontSize: 14 }}>✺</span>
        <span style={{ fontSize: 18 }}>❋</span>
        <span style={{ fontSize: 14 }}>✺</span>
      </div>
      <p
        className="text-center"
        style={{
          fontFamily: "var(--font-cormorant)",
          fontStyle: "italic",
          fontSize: 13,
          color: INK_SOFT,
          lineHeight: 1.8,
          letterSpacing: "0.02em",
        }}
      >
        הוגה ונוסח במשרד &nbsp; · &nbsp; רפי, עורך ראשי &nbsp; · &nbsp; InsAgent,
        מנוע התובנות
        <br />
        <span style={{ color: INK_FAINT }}>
          imprimé sur papier chaud &nbsp; · &nbsp; tiré à l'unité, pour l'usage
          interne du bureau
        </span>
      </p>
      <div className="mt-6 flex items-center justify-center">
        <Monogram />
      </div>
    </footer>
  );
}

/* ────────────────────────────── Primitives ───────────────────────────── */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex items-center gap-4"
      style={{
        fontFamily: "var(--font-cormorant)",
        fontSize: 11,
        letterSpacing: "0.4em",
        textTransform: "uppercase",
        color: INK_SOFT,
      }}
    >
      <span style={{ color: RUST }}>❋</span>
      <span>{children}</span>
      <div className="flex-1 h-px" style={{ background: RULE }} />
    </div>
  );
}

function DoubleRule({ className = "" }: { className?: string }) {
  return (
    <div className={className} aria-hidden>
      <div className="h-px w-full" style={{ background: RULE }} />
      <div className="h-[2px]" />
      <div className="h-px w-full" style={{ background: RULE, opacity: 0.5 }} />
    </div>
  );
}

function ThinRule() {
  return <div className="h-px w-full" style={{ background: RULE, opacity: 0.6 }} />;
}

function Fleuron() {
  return (
    <span
      aria-hidden
      style={{
        color: RUST,
        fontFamily: "var(--font-cormorant)",
        fontSize: 12,
      }}
    >
      ❋
    </span>
  );
}

function Flourish() {
  return (
    <span
      aria-hidden
      style={{
        color: INK_FAINT,
        fontSize: 11,
        fontFamily: "var(--font-cormorant)",
        fontStyle: "normal",
      }}
    >
      ✦
    </span>
  );
}

function NumTick({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontFamily: "var(--font-frank-ruhl)",
        fontWeight: 500,
        color: RUST,
        borderBottom: `1px solid ${RUST}`,
        paddingBottom: 1,
      }}
    >
      {children}
    </span>
  );
}

function CornerTicks() {
  const common: React.CSSProperties = {
    position: "absolute",
    width: 14,
    height: 14,
    borderColor: INK_FAINT,
    opacity: 0.55,
  };
  return (
    <>
      <span
        aria-hidden
        style={{ ...common, top: 10, insetInlineStart: 10, borderTop: "1px solid", borderInlineStart: "1px solid" }}
      />
      <span
        aria-hidden
        style={{ ...common, top: 10, insetInlineEnd: 10, borderTop: "1px solid", borderInlineEnd: "1px solid" }}
      />
      <span
        aria-hidden
        style={{ ...common, bottom: 10, insetInlineStart: 10, borderBottom: "1px solid", borderInlineStart: "1px solid" }}
      />
      <span
        aria-hidden
        style={{ ...common, bottom: 10, insetInlineEnd: 10, borderBottom: "1px solid", borderInlineEnd: "1px solid" }}
      />
    </>
  );
}

function ScoreBadge({ score }: { score: number }) {
  return (
    <div
      className="relative flex-shrink-0"
      style={{
        width: 74,
        height: 74,
        borderRadius: "50%",
        border: `1px solid ${RUST}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
      }}
    >
      {/* inner ring */}
      <div
        aria-hidden
        className="absolute"
        style={{
          inset: 4,
          borderRadius: "50%",
          border: `1px solid ${RUST}`,
          opacity: 0.3,
        }}
      />
      <span
        style={{
          fontFamily: "var(--font-frank-ruhl)",
          fontWeight: 500,
          fontSize: 26,
          color: RUST,
          lineHeight: 1,
        }}
      >
        {toEastern(score)}
      </span>
      <span
        style={{
          fontFamily: "var(--font-cormorant)",
          fontSize: 8,
          letterSpacing: "0.3em",
          textTransform: "uppercase",
          color: RUST,
          marginTop: 3,
        }}
      >
        score
      </span>
    </div>
  );
}

function AtelierLink({
  children,
  primary,
}: {
  children: React.ReactNode;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      className="group inline-flex items-center gap-2"
      style={{
        fontFamily: "var(--font-frank-ruhl)",
        fontWeight: primary ? 500 : 400,
        fontSize: 15,
        color: primary ? RUST : INK_SOFT,
        borderBottom: `1px solid ${primary ? RUST : "transparent"}`,
        paddingBottom: 2,
        background: "transparent",
        cursor: "pointer",
      }}
    >
      {primary && <span aria-hidden>→</span>}
      <span>{children}</span>
    </button>
  );
}

function Monogram() {
  return (
    <svg
      width="52"
      height="52"
      viewBox="0 0 52 52"
      aria-hidden
      style={{ color: RUST }}
    >
      <circle cx="26" cy="26" r="25" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.6" />
      <circle cx="26" cy="26" r="20" fill="none" stroke="currentColor" strokeWidth="0.5" opacity="0.35" />
      <text
        x="26"
        y="31"
        textAnchor="middle"
        fontFamily="var(--font-frank-ruhl)"
        fontSize="18"
        fontWeight="500"
        fill="currentColor"
      >
        ר
      </text>
      <text
        x="26"
        y="45"
        textAnchor="middle"
        fontFamily="var(--font-cormorant)"
        fontSize="6"
        letterSpacing="0.3em"
        fill="currentColor"
        opacity="0.7"
      >
        EST·26
      </text>
    </svg>
  );
}
