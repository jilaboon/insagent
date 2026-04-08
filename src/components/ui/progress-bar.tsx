import { cn } from "@/lib/utils";

type ProgressVariant = "primary" | "success" | "warning";

interface ProgressBarProps {
  value: number;
  variant?: ProgressVariant;
  className?: string;
}

const variantStyles: Record<ProgressVariant, string> = {
  primary: "bg-primary-600",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
};

export function ProgressBar({
  value,
  variant = "primary",
  className,
}: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, value));

  return (
    <div
      className={cn(
        "h-2 w-full overflow-hidden rounded-full bg-surface-200",
        className
      )}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn(
          "h-full rounded-full transition-all duration-500 ease-out",
          variantStyles[variant]
        )}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
