import { cn } from "@/lib/utils";
import { forwardRef } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

/**
 * Button — Prism treatment.
 *
 * API is unchanged (variant, size, plus every native button prop).
 *   - primary:   chromatic gradient (indigo → violet → rose), soft glow on hover
 *   - secondary: glass pill with a violet edge on hover
 *   - ghost:     transparent; violet text + tint on hover
 *   - danger:    rose gradient
 */

const variantStyles: Record<ButtonVariant, string> = {
  primary: cn(
    // gradient fill, white text, violet glow
    "text-white border border-white/40",
    "bg-gradient-to-l from-indigo-500 via-violet-500 to-rose-400",
    "shadow-[0_1px_0_rgba(255,255,255,0.5)_inset,0_8px_24px_-10px_rgba(167,139,250,0.65),0_2px_8px_-2px_rgba(129,140,248,0.35)]",
    "hover:shadow-[0_1px_0_rgba(255,255,255,0.6)_inset,0_12px_30px_-10px_rgba(167,139,250,0.85),0_4px_12px_-2px_rgba(240,171,252,0.45)]",
    "hover:brightness-[1.05] active:brightness-[0.98]"
  ),
  secondary: cn(
    "text-surface-800 border border-white/70",
    "bg-white/60 backdrop-blur-md backdrop-saturate-150",
    "shadow-[0_1px_0_rgba(255,255,255,0.9)_inset,0_4px_12px_-4px_rgba(80,70,180,0.18)]",
    "hover:border-violet-300/70 hover:bg-white/75 hover:text-violet-700",
    "active:bg-white/85"
  ),
  ghost: cn(
    "text-surface-600 bg-transparent border border-transparent",
    "hover:bg-violet-500/10 hover:text-violet-700"
  ),
  danger: cn(
    "text-white border border-white/40",
    "bg-gradient-to-l from-rose-500 via-rose-400 to-pink-400",
    "shadow-[0_1px_0_rgba(255,255,255,0.5)_inset,0_8px_24px_-10px_rgba(244,114,182,0.6),0_2px_8px_-2px_rgba(244,63,94,0.35)]",
    "hover:brightness-[1.05] active:brightness-[0.98]"
  ),
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs gap-1.5 rounded-lg",
  md: "h-9 px-4 text-sm gap-2 rounded-lg",
  lg: "h-11 px-6 text-sm gap-2 rounded-xl",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", className, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center font-medium transition-all duration-200",
          "disabled:pointer-events-none disabled:opacity-50",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent",
          variantStyles[variant],
          sizeStyles[size],
          className
        )}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
