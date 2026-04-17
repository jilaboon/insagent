import { cn } from "@/lib/utils";

type BadgeVariant =
  | "default"
  | "primary"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "muted";

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

/**
 * Badge — Prism glass pill.
 *
 * API is unchanged. Each variant uses a translucent colored fill with a
 * matching 1px border, so it reads as a tiny glass chip against the
 * ambient field. All text colors keep WCAG-AA contrast on white.
 */
const variantStyles: Record<BadgeVariant, string> = {
  default:
    "bg-white/55 text-surface-700 border-white/70 shadow-[0_1px_0_rgba(255,255,255,0.8)_inset]",
  primary:
    "bg-[rgba(167,139,250,0.14)] text-violet-700 border-[rgba(167,139,250,0.4)]",
  success:
    "bg-[rgba(34,211,238,0.14)] text-cyan-700 border-[rgba(34,211,238,0.4)] shadow-[0_0_10px_-2px_rgba(34,211,238,0.35)]",
  warning: "bg-amber-400/15 text-amber-700 border-amber-300/50",
  danger:
    "bg-[rgba(240,171,252,0.16)] text-fuchsia-700 border-[rgba(240,171,252,0.45)]",
  info:
    "bg-[rgba(129,140,248,0.14)] text-indigo-700 border-[rgba(129,140,248,0.4)]",
  muted:
    "bg-white/40 text-surface-500 border-white/60",
};

export function Badge({ children, variant = "default", className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium backdrop-blur-md",
        variantStyles[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
