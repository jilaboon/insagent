import { cn } from "@/lib/utils";
import { forwardRef } from "react";

interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  className?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        type="checkbox"
        className={cn(
          "h-4 w-4 shrink-0 cursor-pointer rounded border border-surface-300 bg-white transition-colors",
          "checked:border-primary-600 checked:bg-primary-600",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/20 focus-visible:ring-offset-1",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "accent-primary-600",
          className
        )}
        {...props}
      />
    );
  }
);

Checkbox.displayName = "Checkbox";
