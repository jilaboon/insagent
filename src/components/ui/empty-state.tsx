import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-16 text-center",
        className
      )}
    >
      {/* Glass icon with a soft chromatic halo so it reads on the Prism
          background instead of looking flat. */}
      <div className="relative mb-4">
        <span
          aria-hidden
          className="pointer-events-none absolute -inset-3 rounded-full"
          style={{
            background:
              "conic-gradient(from 0deg, rgba(240,171,252,0.35), rgba(129,140,248,0.35), rgba(34,211,238,0.3), rgba(167,139,250,0.35), rgba(240,171,252,0.35))",
            filter: "blur(14px)",
            opacity: 0.55,
          }}
        />
        <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-white/70 bg-white/60 backdrop-blur-xl backdrop-saturate-150 shadow-[0_1px_0_rgba(255,255,255,0.9)_inset,0_6px_18px_-6px_rgba(80,70,180,0.2)]">
          <Icon className="h-6 w-6 text-violet-600" />
        </div>
      </div>
      <h3 className="mb-1 text-base font-light tracking-tight text-surface-900">
        {title}
      </h3>
      {description && (
        <p className="mb-4 max-w-sm text-sm text-surface-600">{description}</p>
      )}
      {action}
    </div>
  );
}
