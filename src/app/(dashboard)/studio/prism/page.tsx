import { STUDIO_QUEUE, STUDIO_STATS, type StudioQueueEntry, type StudioInsight } from "../_shared/mock-queue";
import styles from "./prism.module.css";

export const metadata = {
  title: "Prism · פריזמה",
};

/* ---------------------------------------------------------------
   Color system per reason category
   --------------------------------------------------------------- */

type Tone = {
  ring: string;        // stroke color
  pillBg: string;
  pillText: string;
  pillBorder: string;
  glow: string;        // radial background behind card
  dot: string;
};

const TONES: Record<string, Tone> = {
  AGE_MILESTONE: {
    ring: "#A78BFA",
    pillBg: "rgba(167,139,250,0.12)",
    pillText: "#6D28D9",
    pillBorder: "rgba(167,139,250,0.35)",
    glow: "radial-gradient(60% 90% at 100% 0%, rgba(167,139,250,0.22), transparent 60%)",
    dot: "#A78BFA",
  },
  HIGH_VALUE: {
    ring: "#F0ABFC",
    pillBg: "rgba(240,171,252,0.14)",
    pillText: "#A21CAF",
    pillBorder: "rgba(240,171,252,0.4)",
    glow: "radial-gradient(60% 90% at 100% 0%, rgba(240,171,252,0.22), transparent 60%)",
    dot: "#F0ABFC",
  },
  COST_OPTIMIZATION: {
    ring: "#22D3EE",
    pillBg: "rgba(34,211,238,0.12)",
    pillText: "#0E7490",
    pillBorder: "rgba(34,211,238,0.35)",
    glow: "radial-gradient(60% 90% at 100% 0%, rgba(34,211,238,0.22), transparent 60%)",
    dot: "#22D3EE",
  },
  COVERAGE_GAP: {
    ring: "#818CF8",
    pillBg: "rgba(129,140,248,0.12)",
    pillText: "#4338CA",
    pillBorder: "rgba(129,140,248,0.35)",
    glow: "radial-gradient(60% 90% at 100% 0%, rgba(129,140,248,0.22), transparent 60%)",
    dot: "#818CF8",
  },
  POLICY_AGE_REVIEW: {
    ring: "#C4B5FD",
    pillBg: "rgba(196,181,253,0.14)",
    pillText: "#5B21B6",
    pillBorder: "rgba(196,181,253,0.4)",
    glow: "radial-gradient(60% 90% at 100% 0%, rgba(196,181,253,0.2), transparent 60%)",
    dot: "#C4B5FD",
  },
  SERVICE: {
    ring: "#67E8F9",
    pillBg: "rgba(103,232,249,0.14)",
    pillText: "#155E75",
    pillBorder: "rgba(103,232,249,0.4)",
    glow: "radial-gradient(60% 90% at 100% 0%, rgba(103,232,249,0.18), transparent 60%)",
    dot: "#67E8F9",
  },
};

function toneFor(category: string): Tone {
  return TONES[category] ?? TONES.AGE_MILESTONE;
}

/* ---------------------------------------------------------------
   SVG ring gauge (server component, no JS)
   --------------------------------------------------------------- */

function Ring({
  value,
  max = 100,
  size,
  stroke,
  className,
  ringClass,
  bgClass,
}: {
  value: number;
  max?: number;
  size: number;
  stroke: string;
  className?: string;
  ringClass: string;
  bgClass: string;
}) {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(value / max, 1));
  const targetOffset = circumference * (1 - clamped);

  // CSS custom props drive the ring-fill keyframe (from full offset → target).
  const cssVars = {
    ["--ring-circumference" as string]: `${circumference.toFixed(2)}`,
    ["--ring-offset" as string]: `${targetOffset.toFixed(2)}`,
  } as React.CSSProperties;

  return (
    <svg className={className} width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={radius} className={bgClass} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        className={ringClass}
        stroke={stroke}
        strokeDasharray={circumference.toFixed(2)}
        style={{ ...cssVars, strokeDashoffset: targetOffset.toFixed(2), color: stroke }}
      />
    </svg>
  );
}

/* ---------------------------------------------------------------
   Queue card
   --------------------------------------------------------------- */

function QueueCard({ entry, index }: { entry: StudioQueueEntry; index: number }) {
  const tone = toneFor(entry.primaryInsight.category);

  return (
    <article
      className={`${styles.glass} ${styles.card}`}
      style={{ animationDelay: `${index * 90 + 200}ms` }}
    >
      <div className={styles.cardGlow} style={{ background: tone.glow }} />

      {/* Rank + ring */}
      <div className={styles.rankWrap}>
        <Ring
          className={styles.rankSvg}
          value={entry.primaryInsight.score}
          size={88}
          stroke={tone.ring}
          ringClass={styles.rankFg}
          bgClass={styles.rankBg}
        />
        <div className={styles.rankCore}>
          <div style={{ textAlign: "center" }}>
            <div className={styles.rankNum}>{entry.rank}</div>
            <div className={styles.rankLabel}>RANK</div>
          </div>
        </div>
      </div>

      {/* Middle content */}
      <div className={styles.mid}>
        <div className={styles.topRow}>
          <span className={styles.name}>{entry.customerName}</span>
          <span className={styles.ageChip}>גיל {entry.age}</span>
          <span className={styles.ageChip}>{entry.policyCount} פוליסות</span>
          <span className={styles.savings}>{entry.savings}</span>
        </div>

        <div className={styles.whyRow}>
          <span className={styles.whyLabel}>למה היום</span>
          <span className={styles.emojiBubble} aria-hidden>{entry.reasonIcon}</span>
          <span className={styles.whyText}>{entry.whyToday}</span>
        </div>

        <div
          className={styles.insightPill}
          style={{
            ["--pill-bg" as string]: tone.pillBg,
            ["--pill-text" as string]: tone.pillText,
            ["--pill-border" as string]: tone.pillBorder,
          } as React.CSSProperties}
        >
          <span className={styles.pillDot} />
          <span>{entry.primaryInsight.title}</span>
        </div>

        {entry.supporting.length > 0 && (
          <div className={styles.supportRow}>
            {entry.supporting.map((s: StudioInsight) => {
              const t = toneFor(s.category);
              return (
                <span key={s.title} className={styles.supportChip}>
                  <span className={styles.supportDot} style={{ background: t.dot }} />
                  {s.title}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* Right: score ring + action */}
      <div className={styles.rightCol}>
        <div className={styles.scoreWrap}>
          <Ring
            className={styles.scoreSvg}
            value={entry.primaryInsight.score}
            size={64}
            stroke={tone.ring}
            ringClass={styles.scoreFg}
            bgClass={styles.scoreBg}
          />
          <span className={styles.scoreNum}>{entry.primaryInsight.score}</span>
        </div>
        <a href={`tel:${entry.phone}`} className={styles.phoneBtn}>{entry.phone}</a>
      </div>
    </article>
  );
}

/* ---------------------------------------------------------------
   Stat chip
   --------------------------------------------------------------- */

function StatChip({
  label,
  value,
  sub,
  glow,
  delay,
}: {
  label: string;
  value: string;
  sub: string;
  glow: string;
  delay: number;
}) {
  return (
    <div
      className={`${styles.glass} ${styles.chip}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className={`${styles.chipGlow} ${glow}`} />
      <div className={styles.chipLabel}>{label}</div>
      <div className={styles.chipValue}>{value}</div>
      <div className={styles.chipSub}>{sub}</div>
    </div>
  );
}

/* ---------------------------------------------------------------
   Page
   --------------------------------------------------------------- */

export default function PrismPage() {
  return (
    <div className={styles.stage}>
      {/* Ambient layers */}
      <div className={styles.field} aria-hidden>
        <div className={`${styles.blob} ${styles.blobIndigo}`} />
        <div className={`${styles.blob} ${styles.blobViolet}`} />
        <div className={`${styles.blob} ${styles.blobCyan}`} />
        <div className={`${styles.blob} ${styles.blobRose}`} />
      </div>
      <div className={styles.grain} aria-hidden />
      <div className={styles.flare} aria-hidden />

      {/* Hero */}
      <section className={styles.hero}>
        <span className={styles.eyebrow}>
          <span className={styles.eyebrowDot} />
          PRISM · גרסת עיצוב
        </span>

        <h1 className={styles.title}>
          התור של היום,
          <br />
          <span className={styles.titleGrad}>שקוף כמו זכוכית.</span>
        </h1>

        <p className={styles.subtitle}>
          המוח של InsAgent דורג את כל 8,003 הלקוחות שלך הלילה, זיקק 17,256 תובנות,
          והציף את חמשת השיחות שישנו את היום שלך. כל כרטיס הוא עדשה — ריכוז ההקשר
          על לקוח אחד, בלי הרעש שמסביב.
        </p>

        <div className={styles.chipRow}>
          <StatChip
            label="לקוחות במאגר"
            value={STUDIO_STATS.totalCustomers.toLocaleString("he-IL")}
            sub="מסונכרנים ונחקרו הלילה"
            glow={styles.chipGlowIndigo}
            delay={250}
          />
          <StatChip
            label="תובנות פעילות"
            value={STUDIO_STATS.totalInsights.toLocaleString("he-IL")}
            sub={`${STUDIO_STATS.pendingApprovals} ממתינות לאישור`}
            glow={styles.chipGlowViolet}
            delay={350}
          />
          <StatChip
            label="בתור היום"
            value={STUDIO_STATS.queueToday.toLocaleString("he-IL")}
            sub={`מעודכן ${STUDIO_STATS.lastRebuild}`}
            glow={styles.chipGlowCyan}
            delay={450}
          />
        </div>
      </section>

      {/* Queue */}
      <section>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>חמשת הראשונים בתור</h2>
          <span className={styles.sectionMeta}>
            <span className={styles.pulse} />
            מתעדכן חי · דירוג חושב הלילה
          </span>
        </div>

        <div className={styles.grid}>
          {STUDIO_QUEUE.map((entry, i) => (
            <QueueCard key={entry.rank} entry={entry} index={i} />
          ))}
        </div>
      </section>
    </div>
  );
}
