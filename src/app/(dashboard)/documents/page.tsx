import { EmptyState } from "@/components/ui/empty-state";
import { FileText } from "lucide-react";

export default function DocumentsPage() {
  return (
    <EmptyState
      icon={FileText}
      title="עדיין לא הועלו מסמכים"
      description="כדי להתחיל, העלו מסמך וקשרו אותו ללקוח"
    />
  );
}
