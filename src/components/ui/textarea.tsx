import { cn } from "@/lib/utils";
import { forwardRef } from "react";

type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={cn(
          // Glass-friendly input: mostly opaque white so text is crisp on
          // the ambient gradient behind the card, but still feels part of
          // the translucent chrome with a soft violet focus ring.
          "w-full rounded-lg border border-white/80 bg-white/80 px-3 py-2 text-sm text-surface-900 text-right placeholder:text-surface-500 backdrop-blur-sm transition-colors",
          "focus:border-violet-400/60 focus:bg-white/90 focus:outline-none focus:ring-2 focus:ring-violet-400/25",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "min-h-[80px] resize-y",
          className
        )}
        {...props}
      />
    );
  }
);

Textarea.displayName = "Textarea";
