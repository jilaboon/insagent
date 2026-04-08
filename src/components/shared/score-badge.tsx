import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface ScoreBadgeProps {
  score: number;
  className?: string;
}

export function ScoreBadge({ score, className }: ScoreBadgeProps) {
  const variant =
    score >= 80 ? "success" : score >= 50 ? "warning" : "default";

  return (
    <Badge variant={variant} className={cn("number", className)}>
      {score}
    </Badge>
  );
}
