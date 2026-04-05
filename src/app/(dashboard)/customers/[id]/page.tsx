import { mockCustomerDetail } from "@/lib/mock-customer-detail";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DataFreshness,
  UrgencyIndicator,
  StrengthIndicator,
  CompletenessIndicator,
} from "@/components/ui/indicators";
import { DataCoverageBanner } from "@/components/ui/data-coverage-banner";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  policyCategoryLabels,
  recommendationTypeLabels,
} from "@/lib/mock-data";
import {
  User,
  MapPin,
  Shield,
  ShieldOff,
  Check,
  X,
  Clock,
  ArrowLeft,
  Upload,
  Lightbulb,
  Star,
  FileText,
} from "lucide-react";

export default function CustomerProfilePage() {
  const customer = mockCustomerDetail;

  return (
    <div className="space-y-6 animate-[fadeIn_0.3s_ease-out_forwards]">
      {/* Data coverage banner */}
      <DataCoverageBanner
        fileCount={customer.importFileCount}
        lastUpdated={customer.lastImportDate}
      />

      {/* Customer header */}
      <Card>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-5">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-50 text-primary-700">
              <span className="text-lg font-bold">
                {customer.firstName[0]}
                {customer.lastName[0]}
              </span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-surface-900">
                {customer.firstName} {customer.lastName}
              </h1>
              <div className="mt-1 flex items-center gap-4 text-sm text-surface-500">
                <span className="flex items-center gap-1 number">
                  <User className="h-3.5 w-3.5" />
                  ת.ז. {customer.israeliId}
                </span>
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {customer.address}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <CompletenessIndicator level={customer.profileCompleteness} />
            <Badge variant="primary">
              מנהל: {customer.assignedManager}
            </Badge>
          </div>
        </div>
      </Card>

      {/* Insurance map */}
      <Card>
        <CardHeader>
          <CardTitle>מפת הביטוח</CardTitle>
        </CardHeader>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-7">
          {(
            Object.entries(customer.insuranceMap) as [
              string,
              (typeof customer.insuranceMap)[keyof typeof customer.insuranceMap]
            ][]
          ).map(([key, cat]) => (
            <InsuranceMapCard
              key={key}
              category={key}
              label={policyCategoryLabels[key] || key}
              data={cat}
            />
          ))}
        </div>
      </Card>

      {/* Main content — two column */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left column (2/3) — Insights + Recommendations */}
        <div className="space-y-6 lg:col-span-2">
          {/* Insights */}
          <Card>
            <CardHeader>
              <CardTitle>
                <span className="flex items-center gap-2">
                  <Lightbulb className="h-4 w-4 text-accent-500" />
                  תובנות
                </span>
              </CardTitle>
              <Badge variant="muted">{customer.insights.length}</Badge>
            </CardHeader>
            <div className="space-y-3">
              {customer.insights.map((insight) => (
                <div
                  key={insight.id}
                  className="rounded-lg border border-surface-100 p-4"
                >
                  <div className="mb-2 flex items-start justify-between">
                    <h4 className="text-sm font-medium text-surface-900">
                      {insight.title}
                    </h4>
                    <UrgencyIndicator level={insight.urgencyLevel} />
                  </div>
                  <p className="mb-2 text-sm text-surface-600">
                    {insight.summary}
                  </p>
                  <div className="flex items-center gap-3 text-xs text-surface-400">
                    <span>{insight.whyNow}</span>
                    <Badge variant="muted">{insight.generatedBy === "DETERMINISTIC" ? "נתון מחושב" : "הערכת המערכת"}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Recommendations */}
          <Card>
            <CardHeader>
              <CardTitle>
                <span className="flex items-center gap-2">
                  <Star className="h-4 w-4 text-primary-600" />
                  המלצות
                </span>
              </CardTitle>
              <Badge variant="primary">
                {customer.recommendations.length} ממתינות
              </Badge>
            </CardHeader>
            <div className="space-y-3">
              {customer.recommendations.map((rec) => (
                <div
                  key={rec.id}
                  className="rounded-lg border border-surface-200 p-4"
                >
                  <div className="mb-2 flex items-start justify-between">
                    <div>
                      <div className="mb-1 flex items-center gap-2">
                        <h4 className="text-sm font-semibold text-surface-900">
                          {rec.title}
                        </h4>
                        <Badge variant="muted">
                          {recommendationTypeLabels[rec.type]}
                        </Badge>
                      </div>
                      <p className="text-sm text-surface-600">
                        {rec.shortExplanation}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 pr-4">
                      <StrengthIndicator level={rec.strengthLevel} />
                      <UrgencyIndicator level={rec.urgencyLevel} />
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-surface-100 pt-3">
                    <p className="text-xs text-surface-500">{rec.whyNow}</p>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm">
                        <Clock className="h-3.5 w-3.5" />
                        דחייה
                      </Button>
                      <Button variant="secondary" size="sm">
                        <X className="h-3.5 w-3.5" />
                        דחייה
                      </Button>
                      <Button variant="primary" size="sm">
                        <Check className="h-3.5 w-3.5" />
                        אישור
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Right column (1/3) — Policies + Timeline */}
        <div className="space-y-6">
          {/* Policies summary */}
          <Card>
            <CardHeader>
              <CardTitle>פוליסות</CardTitle>
              <Badge variant="muted">{customer.policies.length}</Badge>
            </CardHeader>
            <div className="space-y-2">
              {customer.policies.map((policy) => (
                <div
                  key={policy.id}
                  className="flex items-center justify-between rounded-lg border border-surface-100 p-3"
                >
                  <div className="flex-1">
                    <p className="text-sm font-medium text-surface-800">
                      {policy.subType}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-surface-500">
                      <span>{policy.insurer}</span>
                      <span className="number">{policy.policyNumber}</span>
                    </div>
                  </div>
                  <div className="text-left">
                    {policy.premiumAnnual ? (
                      <p className="text-sm font-medium text-surface-800 number">
                        {formatCurrency(policy.premiumAnnual)}
                        <span className="text-xs text-surface-400"> /שנה</span>
                      </p>
                    ) : policy.accumulatedSavings ? (
                      <p className="text-sm font-medium text-surface-800 number">
                        {formatCurrency(policy.accumulatedSavings)}
                      </p>
                    ) : (
                      <p className="text-xs text-surface-400">₪0</p>
                    )}
                    <DataFreshness date={policy.dataFreshness} />
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Timeline */}
          <Card>
            <CardHeader>
              <CardTitle>ציר זמן</CardTitle>
            </CardHeader>
            <div className="space-y-4">
              {customer.timeline.map((event) => (
                <div key={event.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div
                      className={`flex h-7 w-7 items-center justify-center rounded-full ${
                        event.type === "import"
                          ? "bg-sky-50 text-sky-600"
                          : event.type === "insight"
                            ? "bg-accent-50 text-accent-600"
                            : "bg-primary-50 text-primary-600"
                      }`}
                    >
                      {event.type === "import" && (
                        <Upload className="h-3.5 w-3.5" />
                      )}
                      {event.type === "insight" && (
                        <Lightbulb className="h-3.5 w-3.5" />
                      )}
                      {event.type === "recommendation" && (
                        <Star className="h-3.5 w-3.5" />
                      )}
                    </div>
                    <div className="mt-1 h-full w-px bg-surface-200" />
                  </div>
                  <div className="pb-4">
                    <p className="text-sm text-surface-700">
                      {event.description}
                    </p>
                    <p className="text-xs text-surface-400 number">
                      {formatDate(event.date)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Insurance Map Card
// ============================================================

function InsuranceMapCard({
  category,
  label,
  data,
}: {
  category: string;
  label: string;
  data: {
    exists: boolean;
    dataFreshness: string | null;
    policyCount?: number;
    totalAnnualPremium?: number;
    totalMonthlyPremium?: number;
    totalAccumulated?: number;
    insurers?: string[];
    nearestExpiry?: string | null;
  };
}) {
  if (!data.exists) {
    return (
      <div className="flex flex-col items-center rounded-lg border border-dashed border-surface-200 bg-surface-50/50 p-4 text-center">
        <ShieldOff className="mb-2 h-5 w-5 text-surface-300" />
        <p className="text-xs font-medium text-surface-400">{label}</p>
        <p className="mt-1 text-[10px] text-surface-400">
          לא זוהה בנתונים שנקלטו
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col rounded-lg border border-surface-200 bg-white p-4 text-center">
      <Shield className="mx-auto mb-2 h-5 w-5 text-primary-500" />
      <p className="text-xs font-semibold text-surface-800">{label}</p>
      {data.policyCount && (
        <p className="mt-1 text-[10px] text-surface-500 number">
          {data.policyCount} פוליסות
        </p>
      )}
      {data.totalAnnualPremium && (
        <p className="mt-0.5 text-xs font-medium text-surface-700 number">
          {formatCurrency(data.totalAnnualPremium)}/שנה
        </p>
      )}
      {data.totalAccumulated && (
        <p className="mt-0.5 text-xs font-medium text-surface-700 number">
          {formatCurrency(data.totalAccumulated)}
        </p>
      )}
      {data.dataFreshness && (
        <div className="mt-2">
          <DataFreshness date={data.dataFreshness} />
        </div>
      )}
    </div>
  );
}
