/**
 * NeonRing
 * --------
 * A small SVG circular gauge with a neon-colored arc and a soft glow.
 * Used for rank / score dots on customer cards, dashboards, etc.
 *
 * Props:
 *   value: 0–100 (clamped)
 *   size:  square pixel size (default 56)
 *   color: forced palette color; auto-chosen from value if omitted.
 *          >= 85 → rose   (strongest)
 *          >= 70 → violet
 *          >= 50 → indigo
 *          <  50 → cyan   (coolest)
 *
 * Motion: on mount the foreground arc animates from empty → target
 * offset via the `prism-ring-fill` keyframe. Under
 * `prefers-reduced-motion`, the globals.css rule disables the animation
 * and the arc just appears already filled (dashoffset set inline).
 */

import { cn } from "@/lib/utils";

type PrismColor = "indigo" | "violet" | "cyan" | "rose";

const STROKES: Record<PrismColor, string> = {
  indigo: "#818CF8",
  violet: "#A78BFA",
  cyan: "#22D3EE",
  rose: "#F0ABFC",
};

function autoColor(value: number): PrismColor {
  if (value >= 85) return "rose";
  if (value >= 70) return "violet";
  if (value >= 50) return "indigo";
  return "cyan";
}

interface NeonRingProps {
  value: number;
  size?: number;
  color?: PrismColor;
  /** Stroke width in SVG user units. Scales with size. */
  strokeWidth?: number;
  /** Hide the centered number */
  hideLabel?: boolean;
  /** Override the centered label (defaults to the rounded value) */
  label?: string;
  className?: string;
}

export function NeonRing({
  value,
  size = 56,
  color,
  strokeWidth = 3,
  hideLabel = false,
  label,
  className,
}: NeonRingProps) {
  const clampedValue = Math.max(0, Math.min(100, value));
  const resolvedColor = color ?? autoColor(clampedValue);
  const stroke = STROKES[resolvedColor];

  const radius = (size - strokeWidth * 2 - 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clampedValue / 100);

  // Custom properties drive the ring-fill keyframe from full offset → target.
  const cssVars = {
    ["--prism-ring-circumference" as string]: circumference.toFixed(2),
    ["--prism-ring-offset" as string]: offset.toFixed(2),
  } as React.CSSProperties;

  const labelText = label ?? `${Math.round(clampedValue)}`;

  return (
    <span
      className={cn(
        "relative inline-grid place-items-center",
        className
      )}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ transform: "rotate(-90deg)" }}
        aria-hidden
      >
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(120, 110, 180, 0.14)"
          strokeWidth={strokeWidth}
        />
        {/* Foreground arc */}
        <circle
          data-prism-motion="ring"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference.toFixed(2)}
          style={{
            ...cssVars,
            color: stroke,
            strokeDashoffset: offset.toFixed(2),
            filter: `drop-shadow(0 0 4px ${stroke})`,
            animation:
              "prism-ring-fill 1.3s cubic-bezier(0.22, 1, 0.36, 1) both",
          }}
        />
      </svg>

      {!hideLabel && (
        <span
          className="absolute inset-0 grid place-items-center font-light tabular-nums text-surface-900"
          style={{ fontSize: Math.max(10, Math.round(size * 0.28)) }}
        >
          {labelText}
        </span>
      )}
    </span>
  );
}
