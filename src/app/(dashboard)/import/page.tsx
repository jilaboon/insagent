import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";

export default function ImportPage() {
  return (
    <EmptyState
      icon={Upload}
      title="מרכז יבוא נתונים"
      description="העלו קובץ BAFI, Excel או CSV לייבוא נתוני לקוחות"
      action={
        <Button variant="primary">
          <Upload className="h-4 w-4" />
          העלאת קובץ
        </Button>
      }
    />
  );
}
