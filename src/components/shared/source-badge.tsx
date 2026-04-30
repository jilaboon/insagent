import { cn } from "@/lib/utils";

/**
 * SourceBadge — small chip showing where a fact came from.
 *
 * Used everywhere on the Customer 360 so the agent can tell at a glance
 * whether a number is from BAFI, from Har HaBituach, from a Misleka XML,
 * from manual agent input, or (later) from banking. The visual language
 * is intentionally muted so badges don't compete with the data they
 * annotate.
 */

export type SourceKey =
  | "OFFICE"
  | "HAR_HABITUACH"
  | "MISLEKA"
  | "MANUAL"
  | "BANKING";

const STYLES: Record<
  SourceKey,
  { label: string; emoji: string; className: string }
> = {
  OFFICE: {
    label: "משרד",
    emoji: "📁",
    className:
      "border-violet-300/50 bg-violet-500/10 text-violet-700",
  },
  HAR_HABITUACH: {
    label: "הר הביטוח",
    emoji: "📂",
    className:
      "border-violet-300/60 bg-violet-500/15 text-violet-700",
  },
  MISLEKA: {
    label: "מסלקה",
    emoji: "🏦",
    className:
      "border-indigo-300/60 bg-indigo-500/10 text-indigo-700",
  },
  MANUAL: {
    label: "ידני",
    emoji: "✍️",
    className: "border-amber-300/60 bg-amber-500/10 text-amber-700",
  },
  BANKING: {
    label: "בנקאות",
    emoji: "🏧",
    className: "border-cyan-300/60 bg-cyan-500/10 text-cyan-700",
  },
};

export function SourceBadge({
  source,
  showEmoji = true,
  className,
  title,
}: {
  source: SourceKey;
  showEmoji?: boolean;
  className?: string;
  title?: string;
}) {
  const style = STYLES[source];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium backdrop-blur-md",
        style.className,
        className
      )}
      title={title ?? `מקור: ${style.label}`}
    >
      {showEmoji && <span aria-hidden>{style.emoji}</span>}
      <span>{style.label}</span>
    </span>
  );
}

export const SOURCE_LABELS: Record<SourceKey, string> = {
  OFFICE: STYLES.OFFICE.label,
  HAR_HABITUACH: STYLES.HAR_HABITUACH.label,
  MISLEKA: STYLES.MISLEKA.label,
  MANUAL: STYLES.MANUAL.label,
  BANKING: STYLES.BANKING.label,
};
