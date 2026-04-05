import { Card, CardHeader, CardTitle, CardValue } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UrgencyIndicator, StrengthIndicator } from "@/components/ui/indicators";
import {
  mockDashboardStats,
  mockRecentRecommendations,
  mockExpiringPolicies,
  recommendationTypeLabels,
} from "@/lib/mock-data";
import {
  Star,
  AlertTriangle,
  TrendingUp,
  Upload,
  Clock,
  ListTodo,
  ChevronLeft,
  Calendar,
} from "lucide-react";
import Link from "next/link";

export default function DashboardPage() {
  const stats = mockDashboardStats;

  return (
    <div className="space-y-8 animate-[fadeIn_0.3s_ease-out_forwards]">
      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard
          icon={Star}
          label="המלצות ממתינות"
          value={stats.pendingRecommendations}
          color="primary"
        />
        <StatCard
          icon={AlertTriangle}
          label="פוליסות לחידוש"
          value={stats.expiringPolicies}
          color="warning"
        />
        <StatCard
          icon={TrendingUp}
          label="לקוחות עם פוטנציאל"
          value={stats.highOpportunityCustomers}
          color="success"
        />
        <StatCard
          icon={Upload}
          label="יבואים אחרונים"
          value={stats.recentImports}
          color="info"
        />
        <StatCard
          icon={Clock}
          label="פרופילים לא עדכניים"
          value={stats.staleProfiles}
          color="danger"
        />
        <StatCard
          icon={ListTodo}
          label="משימות פתוחות"
          value={stats.openTasks}
          color="default"
        />
      </div>

      {/* Main content — two columns */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Pending recommendations */}
        <Card>
          <CardHeader>
            <CardTitle>המלצות ממתינות לבדיקה</CardTitle>
            <Link
              href="/recommendations"
              className="flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-700"
            >
              הצג הכל
              <ChevronLeft className="h-3.5 w-3.5" />
            </Link>
          </CardHeader>
          <div className="space-y-3">
            {mockRecentRecommendations.map((rec) => (
              <div
                key={rec.id}
                className="flex items-start justify-between rounded-lg border border-surface-100 p-3 transition-colors hover:bg-surface-50"
              >
                <div className="flex-1">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-sm font-medium text-surface-900">
                      {rec.title}
                    </span>
                    <Badge variant="muted">
                      {recommendationTypeLabels[rec.type]}
                    </Badge>
                  </div>
                  <p className="mb-1.5 text-xs text-surface-500">
                    {rec.customerName}
                  </p>
                  <p className="text-xs text-surface-600">{rec.whyNow}</p>
                </div>
                <div className="flex flex-col items-end gap-1.5 pr-4">
                  <UrgencyIndicator level={rec.urgencyLevel} />
                  <StrengthIndicator level={rec.strengthLevel} />
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Expiring policies */}
        <Card>
          <CardHeader>
            <CardTitle>פוליסות קרובות לחידוש</CardTitle>
            <Link
              href="/customers"
              className="flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-700"
            >
              הצג הכל
              <ChevronLeft className="h-3.5 w-3.5" />
            </Link>
          </CardHeader>
          <div className="space-y-3">
            {mockExpiringPolicies.map((policy) => (
              <div
                key={policy.id}
                className="flex items-center justify-between rounded-lg border border-surface-100 p-3 transition-colors hover:bg-surface-50"
              >
                <div>
                  <p className="text-sm font-medium text-surface-900">
                    {policy.policyType}
                  </p>
                  <p className="text-xs text-surface-500">
                    {policy.customerName} · {policy.insurer}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-left">
                    <p className="text-xs text-surface-500">סיום</p>
                    <p className="text-sm font-medium text-surface-800 number">
                      {new Date(policy.endDate).toLocaleDateString("he-IL")}
                    </p>
                  </div>
                  <Badge
                    variant={policy.daysLeft <= 60 ? "warning" : "default"}
                  >
                    <Calendar className="h-3 w-3" />
                    <span className="number">{policy.daysLeft}</span> יום
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ============================================================
// Stat Card
// ============================================================

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  color: "primary" | "success" | "warning" | "danger" | "info" | "default";
}) {
  const iconColors = {
    primary: "bg-primary-50 text-primary-600",
    success: "bg-emerald-50 text-emerald-600",
    warning: "bg-amber-50 text-amber-600",
    danger: "bg-red-50 text-red-600",
    info: "bg-sky-50 text-sky-600",
    default: "bg-surface-100 text-surface-600",
  };

  return (
    <Card padding="sm">
      <div className={`mb-3 flex h-8 w-8 items-center justify-center rounded-lg ${iconColors[color]}`}>
        <Icon className="h-4 w-4" />
      </div>
      <CardValue>{value}</CardValue>
      <p className="mt-1 text-xs text-surface-500">{label}</p>
    </Card>
  );
}
