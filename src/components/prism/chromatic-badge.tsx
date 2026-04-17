/**
 * ChromaticBadge
 * --------------
 * A small glass pill with an emoji on the leading side. Behind the emoji
 * sits a conic-gradient "chromatic halo" that breathes gently. Motion is
 * paused under `prefers-reduced-motion` via the global rule that targets
 * `[data-prism-motion]`.
 *
 * Props:
 *   icon:  emoji string (rendered as text)
 *   label: Hebrew/English label
 *   color: tint for the label and border. Defaults to "violet".
 */

import { cn } from "@/lib/utils";

type PrismColor = "indigo" | "violet" | "cyan" | "rose";

const TEXT: Record<PrismColor, string> = {
  indigo: "#4338CA",
  violet: "#6D28D9",
  cyan: "#0E7490",
  rose: "#A21CAF",
};

const BORDER: Record<PrismColor, string> = {
  indigo: "rgba(129,140,248,0.4)",
  violet: "rgba(167,139,250,0.4)",
  cyan: "rgba(34,211,238,0.4)",
  rose: "rgba(240,171,252,0.4)",
};

const BG: Record<PrismColor, string> = {
  indigo: "rgba(129,140,248,0.12)",
  violet: "rgba(167,139,250,0.12)",
  cyan: "rgba(34,211,238,0.12)",
  rose: "rgba(240,171,252,0.14)",
};

interface ChromaticBadgeProps {
  icon: string;
  label: string;
  color?: PrismColor;
  className?: string;
}

export function ChromaticBadge({
  icon,
  label,
  color = "violet",
  className,
}: ChromaticBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-medium backdrop-blur-md",
        className
      )}
      style={{
        background: BG[color],
        color: TEXT[color],
        border: `1px solid ${BORDER[color]}`,
        boxShadow:
          "0 1px 0 rgba(255,255,255,0.8) inset, 0 4px 12px -6px rgba(80,70,180,0.18)",
      }}
    >
      {/* Icon bubble with chromatic halo */}
      <span className="relative inline-grid h-5 w-5 place-items-center">
        <span
          aria-hidden
          data-prism-motion="breathe"
          className="absolute -inset-1 rounded-full"
          style={{
            background:
              "conic-gradient(from 0deg, rgba(240,171,252,0.55), rgba(129,140,248,0.55), rgba(34,211,238,0.55), rgba(167,139,250,0.55), rgba(240,171,252,0.55))",
            filter: "blur(6px)",
            opacity: 0.7,
            zIndex: 0,
            animation: "prism-breathe-soft 3.8s ease-in-out infinite",
          }}
        />
        <span
          aria-hidden
          className="relative z-[1] grid h-5 w-5 place-items-center rounded-full text-[0.8rem] leading-none"
          style={{
            background: "rgba(255,255,255,0.8)",
            border: "1px solid rgba(255,255,255,0.9)",
            boxShadow: "0 1px 0 rgba(255,255,255,0.9) inset",
          }}
        >
          {icon}
        </span>
      </span>
      <span>{label}</span>
    </span>
  );
}
