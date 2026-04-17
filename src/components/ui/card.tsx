import { cn } from "@/lib/utils";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: "sm" | "md" | "lg";
}

/**
 * Card — Prism glass surface.
 *
 * API is unchanged (children, className, padding: sm|md|lg) so every
 * existing page keeps working. The visual treatment is new:
 *   - Translucent white fill (`bg-white/55`) with heavy backdrop blur
 *   - A violet-tinted soft shadow (cool, not gray)
 *   - A subtle chromatic hairline across the top edge (prism-hairline)
 *   - A soft top-left inner highlight so the card feels lit from above
 *
 * All motion on the hairline respects `prefers-reduced-motion` via
 * globals.css.
 */
export function Card({ children, className, padding = "md" }: CardProps) {
  return (
    <div
      className={cn(
        // base glass
        "prism-hairline relative overflow-hidden rounded-[22px] border border-white/65",
        "bg-white/55 backdrop-blur-xl backdrop-saturate-150",
        // padding variants (preserved API)
        padding === "sm" && "p-4",
        padding === "md" && "p-6",
        padding === "lg" && "p-8",
        className
      )}
      style={{
        boxShadow:
          "0 1px 0 0 rgba(255,255,255,0.9) inset, " +
          "0 -1px 0 0 rgba(130,120,200,0.08) inset, " +
          "0 10px 30px -12px rgba(80,70,180,0.18), " +
          "0 2px 8px -2px rgba(80,70,180,0.08)",
      }}
    >
      {/* Soft inner highlight (top-left curl). Kept below content with
          pointer-events: none so it never blocks interaction. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[inherit]"
        style={{
          background:
            "radial-gradient(120% 80% at 0% 0%, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0) 45%)",
        }}
      />
      <div className="relative">{children}</div>
    </div>
  );
}

export function CardHeader({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-4 flex items-center justify-between", className)}>
      {children}
    </div>
  );
}

export function CardTitle({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h3 className={cn("text-sm font-semibold text-surface-900", className)}>
      {children}
    </h3>
  );
}

export function CardValue({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p className={cn("text-2xl font-bold text-surface-900 number", className)}>
      {children}
    </p>
  );
}
