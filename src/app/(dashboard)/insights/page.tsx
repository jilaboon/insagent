import { EmptyState } from "@/components/ui/empty-state";
import { Lightbulb } from "lucide-react";

export default function InsightsPage() {
  return (
    <EmptyState
      icon={Lightbulb}
      title="עדיין לא נותחו תובנות"
      description="תובנות ייווצרו אוטומטית לאחר יבוא נתוני לקוחות"
    />
  );
}
