"use client";

import { useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CompletenessIndicator,
  DataFreshness,
} from "@/components/ui/indicators";
import { EmptyState } from "@/components/ui/empty-state";
import {
  mockCustomers,
  policyCategoryLabels,
} from "@/lib/mock-data";
import { formatCurrency } from "@/lib/utils";
import { Search, Filter, Users, ChevronLeft, Star } from "lucide-react";

export default function CustomersPage() {
  const [search, setSearch] = useState("");
  const customers = mockCustomers.filter(
    (c) =>
      c.firstName.includes(search) ||
      c.lastName.includes(search) ||
      c.israeliId.includes(search)
  );

  return (
    <div className="space-y-6 animate-[fadeIn_0.3s_ease-out_forwards]">
      {/* Search & filter bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-400" />
          <input
            type="text"
            placeholder="חיפוש לפי שם, ת.ז. ..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 w-full rounded-lg border border-surface-300 bg-white pr-10 pl-4 text-sm text-surface-900 placeholder:text-surface-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
          />
        </div>
        <Button variant="secondary" size="md">
          <Filter className="h-4 w-4" />
          סינון
        </Button>
      </div>

      {/* Results count */}
      <p className="text-sm text-surface-500">
        <span className="font-medium text-surface-700 number">
          {customers.length}
        </span>{" "}
        לקוחות
      </p>

      {/* Customer list */}
      {customers.length === 0 ? (
        <EmptyState
          icon={Users}
          title="לא נמצאו לקוחות"
          description="נסו לשנות את החיפוש או לייבא קובץ חדש"
        />
      ) : (
        <div className="space-y-3">
          {customers.map((customer) => (
            <Link key={customer.id} href={`/customers/${customer.id}`}>
              <Card
                padding="sm"
                className="cursor-pointer transition-all hover:border-primary-200 hover:shadow-sm"
              >
                <div className="flex items-center justify-between">
                  {/* Customer info */}
                  <div className="flex items-center gap-6">
                    {/* Avatar */}
                    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-50 text-primary-700">
                      <span className="text-sm font-bold">
                        {customer.firstName[0]}
                        {customer.lastName[0]}
                      </span>
                    </div>

                    {/* Name & ID */}
                    <div>
                      <h3 className="text-sm font-semibold text-surface-900">
                        {customer.firstName} {customer.lastName}
                      </h3>
                      <p className="text-xs text-surface-500 number">
                        ת.ז. {customer.israeliId}
                      </p>
                    </div>

                    {/* Categories */}
                    <div className="flex gap-1.5">
                      {customer.policyCategories.map((cat) => (
                        <Badge key={cat} variant="default">
                          {policyCategoryLabels[cat] || cat}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {/* Right side — metrics */}
                  <div className="flex items-center gap-8">
                    {/* Premium */}
                    <div className="text-left">
                      <p className="text-xs text-surface-500">פרמיה חודשית</p>
                      <p className="text-sm font-semibold text-surface-800 number">
                        {formatCurrency(customer.totalMonthlyPremium)}
                      </p>
                    </div>

                    {/* Recommendations */}
                    {customer.pendingRecommendations > 0 && (
                      <div className="flex items-center gap-1">
                        <Star className="h-3.5 w-3.5 text-accent-500" />
                        <span className="text-xs font-medium text-accent-700 number">
                          {customer.pendingRecommendations}
                        </span>
                      </div>
                    )}

                    {/* Completeness */}
                    <CompletenessIndicator
                      level={customer.profileCompleteness}
                    />

                    {/* Freshness */}
                    <DataFreshness date={customer.dataFreshness} />

                    <ChevronLeft className="h-4 w-4 text-surface-300" />
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
