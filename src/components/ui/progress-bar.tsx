import { cn } from "@/lib/utils";

type ProgressVariant = "primary" | "success" | "warning";

interface ProgressBarProps {
  value: number;
  variant?: ProgressVariant;
  animated?: boolean;
  className?: string;
}

/**
 * ProgressBar — Prism treatment.
 *
 * API unchanged. Track is a glass pill; fill is a chromatic gradient per
 * variant:
 *   - primary: indigo → violet → rose
 *   - success: cyan → emerald-ish
 *   - warning: amber → rose
 *
 * The existing `progress-bar-animated` shine (globals.css) still runs
 * and is automatically paused by `prefers-reduced-motion` because the
 * keyframes themselves are reduced-motion-safe via media query below.
 */
const variantStyles: Record<ProgressVariant, string> = {
  primary: "bg-gradient-to-l from-indigo-500 via-violet-500 to-rose-400",
  success: "bg-gradient-to-l from-cyan-400 via-teal-400 to-emerald-400",
  warning: "bg-gradient-to-l from-amber-400 via-orange-400 to-rose-400",
};

export function ProgressBar({
  value,
  variant = "primary",
  animated = true,
  className,
}: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, value));

  return (
    <div
      className={cn(
        // Glass track
        "h-2 w-full overflow-hidden rounded-full border border-white/60 bg-white/50 backdrop-blur-md",
        "shadow-[inset_0_1px_1px_rgba(130,120,200,0.08)]",
        className
      )}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn(
          "h-full rounded-full transition-all duration-700 ease-out",
          variantStyles[variant],
          animated && "progress-bar-animated"
        )}
        style={{
          width: `${clamped}%`,
          boxShadow:
            variant === "primary"
              ? "0 0 8px -2px rgba(167,139,250,0.55)"
              : variant === "success"
                ? "0 0 8px -2px rgba(34,211,238,0.5)"
                : "0 0 8px -2px rgba(244,114,182,0.5)",
        }}
      />
    </div>
  );
}
