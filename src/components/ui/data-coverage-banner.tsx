import { cn } from "@/lib/utils";
import { Info } from "lucide-react";

interface DataCoverageBannerProps {
  fileCount: number;
  lastUpdated: Date | string | null;
  className?: string;
}

export function DataCoverageBanner({
  fileCount,
  lastUpdated,
  className,
}: DataCoverageBannerProps) {
  const d = lastUpdated
    ? typeof lastUpdated === "string"
      ? new Date(lastUpdated)
      : lastUpdated
    : null;

  const timeAgo = d ? getTimeAgo(d) : "לא ידוע";

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg border border-surface-200 bg-surface-50 px-4 py-2.5 text-xs text-surface-600",
        className
      )}
    >
      <Info className="h-3.5 w-3.5 shrink-0 text-surface-400" />
      <span>
        התמונה מבוססת על{" "}
        <span className="font-medium text-surface-800">
          {fileCount} {fileCount === 1 ? "קובץ שנקלט" : "קבצים שנקלטו"}
        </span>
        , עודכנה לאחרונה{" "}
        <span className="font-medium text-surface-800">{timeAgo}</span>
      </span>
    </div>
  );
}

function getTimeAgo(date: Date): string {
  const days = Math.round((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (days === 0) return "היום";
  if (days === 1) return "אתמול";
  if (days < 7) return `לפני ${days} ימים`;
  if (days < 30) return `לפני ${Math.round(days / 7)} שבועות`;
  if (days < 365) return `לפני ${Math.round(days / 30)} חודשים`;
  return `לפני ${Math.round(days / 365)} שנים`;
}
