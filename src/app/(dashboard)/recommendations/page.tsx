import { EmptyState } from "@/components/ui/empty-state";
import { Star } from "lucide-react";

export default function RecommendationsPage() {
  return (
    <EmptyState
      icon={Star}
      title="לא נמצאו המלצות ממתינות לבדיקה"
      description="המלצות ייווצרו לאחר ניתוח תובנות לקוחות"
    />
  );
}
