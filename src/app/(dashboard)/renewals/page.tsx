"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Clock, ChevronLeft, FileText, Phone, Mail } from "lucide-react";
import { policyCategoryLabels } from "@/lib/constants";
import { formatCurrency } from "@/lib/utils";

interface RenewalItem {
  policyId: string;
  category: string;
  endDate: string | null;
  daysToExpiry: number | null;
  insurer: string | null;
  premiumMonthly: number | null;
  premiumAnnual: number | null;
  customer: {
    id: string;
    fullName: string;
    israeliId: string;
    phone: string | null;
    email: string | null;
  };
}

interface RenewalsResponse {
  items: RenewalItem[];
  total: number;
}

export default function RenewalsPage() {
  const { data, isLoading } = useQuery<RenewalsResponse>({
    queryKey: ["renewals"],
    queryFn: async () => {
      const res = await fetch("/api/renewals");
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const items = data?.items ?? [];

  return (
    <div className="space-y-6 animate-[fadeIn_0.3s_ease-out_forwards]">
      <div>
        <h1 className="text-3xl font-light tracking-tight text-surface-900 sm:text-4xl">
          חידושים{" "}
          <span
            className="bg-gradient-to-l from-amber-500 via-orange-400 to-rose-400 bg-clip-text text-transparent"
            style={{ WebkitTextFillColor: "transparent" }}
          >
            מ-BAFI
          </span>
        </h1>
        <p className="mt-1.5 text-sm text-surface-600">
          פוליסות שמתחדשות ב-90 הימים הקרובים. מקור הנתונים: קובץ ה-BAFI שיובא.
          <span className="mx-2 text-surface-400">·</span>
          התור הראשי מתמקד בהזדמנויות ייחודיות; חידושים חיים פה כדי שלא יתחרו על תשומת הלב.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} padding="sm">
              <div className="h-14 animate-pulse rounded bg-white/60" />
            </Card>
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="אין פוליסות שמתחדשות בטווח הקרוב"
          description="כשתיובא קובץ BAFI חדש עם תאריכי סיום קרובים, הרשימה תתעדכן כאן."
        />
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const categoryLabel =
              policyCategoryLabels[item.category] ?? item.category;
            const isUrgent =
              item.daysToExpiry != null && item.daysToExpiry <= 14;
            return (
              <Link
                key={item.policyId}
                href={`/customers/${item.customer.id}`}
              >
                <Card
                  padding="sm"
                  className="cursor-pointer transition-all hover:border-amber-300/60 hover:shadow-sm"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-3">
                        <h3 className="truncate text-sm font-semibold text-surface-900">
                          {item.customer.fullName}
                        </h3>
                        <Badge variant="muted">{categoryLabel}</Badge>
                        {item.insurer && (
                          <span className="truncate text-xs text-surface-500">
                            {item.insurer}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-surface-600">
                        <span className="number">
                          ת.ז. {item.customer.israeliId}
                        </span>
                        {item.customer.phone && (
                          <a
                            href={`tel:${item.customer.phone}`}
                            className="inline-flex items-center gap-1 text-surface-600 hover:text-violet-700"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Phone className="h-3 w-3" />
                            <span className="number">
                              {item.customer.phone}
                            </span>
                          </a>
                        )}
                        {item.customer.email && (
                          <span className="inline-flex items-center gap-1 text-surface-500">
                            <Mail className="h-3 w-3" />
                            {item.customer.email}
                          </span>
                        )}
                        {item.premiumAnnual != null && (
                          <span className="text-surface-500">
                            פרמיה שנתית: {formatCurrency(item.premiumAnnual)}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-3">
                      <div className="text-left">
                        <div
                          className={
                            isUrgent
                              ? "inline-flex items-center gap-1 rounded-full border border-amber-300/60 bg-amber-50/70 px-2 py-0.5 text-[11px] font-medium text-amber-700 backdrop-blur-md"
                              : "inline-flex items-center gap-1 rounded-full border border-white/60 bg-white/60 px-2 py-0.5 text-[11px] font-medium text-surface-600 backdrop-blur-md"
                          }
                        >
                          <Clock className="h-3 w-3" />
                          {item.daysToExpiry != null
                            ? `עוד ${item.daysToExpiry} ימים`
                            : "תאריך לא ידוע"}
                        </div>
                        {item.endDate && (
                          <p className="mt-1 text-[11px] text-surface-500 number">
                            {new Date(item.endDate).toLocaleDateString("he-IL")}
                          </p>
                        )}
                      </div>
                      <ChevronLeft className="h-4 w-4 text-surface-300" />
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
