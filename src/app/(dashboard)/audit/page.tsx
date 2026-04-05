import { EmptyState } from "@/components/ui/empty-state";
import { Shield } from "lucide-react";

export default function AuditPage() {
  return (
    <EmptyState
      icon={Shield}
      title="יומן פעילות ריק"
      description="פעולות במערכת יתועדו כאן באופן אוטומטי"
    />
  );
}
