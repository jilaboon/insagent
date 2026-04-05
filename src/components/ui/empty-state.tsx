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
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-surface-100">
        <Icon className="h-6 w-6 text-surface-400" />
      </div>
      <h3 className="mb-1 text-sm font-semibold text-surface-700">{title}</h3>
      {description && (
        <p className="mb-4 max-w-sm text-sm text-surface-500">{description}</p>
      )}
      {action}
    </div>
  );
}
