import { EmptyState } from "@/components/ui/empty-state";
import { ListTodo } from "lucide-react";

export default function TasksPage() {
  return (
    <EmptyState
      icon={ListTodo}
      title="אין משימות פתוחות"
      description="משימות ייווצרו מהמלצות מאושרות או באופן ידני"
    />
  );
}
