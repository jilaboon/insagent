"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCurrency } from "@/lib/utils";
import {
  Search,
  Users,
  ChevronLeft,
  Lightbulb,
  Loader2,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getScoreTier } from "@/lib/constants";

interface CustomerItem {
  id: string;
  firstName: string;
  lastName: string;
  israeliId: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  lastImportDate: string | null;
  policyCount: number;
  activePolicyCount: number;
  insightCount: number;
  latestInsightScore: number | null;
}

interface CustomersResponse {
  items: CustomerItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export default function CustomersPage() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [debounceTimer, setDebounceTimer] = useState<NodeJS.Timeout | null>(null);

  const handleSearch = useCallback(
    (value: string) => {
      setSearch(value);
      if (debounceTimer) clearTimeout(debounceTimer);
      const timer = setTimeout(() => {
        setDebouncedSearch(value);
        setPage(1);
      }, 300);
      setDebounceTimer(timer);
    },
    [debounceTimer]
  );

  const { data, isLoading } = useQuery<CustomersResponse>({
    queryKey: ["customers", debouncedSearch, page],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", "50");
      if (debouncedSearch) params.set("search", debouncedSearch);
      const res = await fetch(`/api/customers?${params}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const customers = data?.items ?? [];

  return (
    <div className="space-y-6 animate-[fadeIn_0.3s_ease-out_forwards]">
      {/* Search bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-500" />
          <input
            type="text"
            placeholder="חיפוש לפי שם, ת.ז. ..."
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="h-10 w-full rounded-lg border border-white/80 bg-white/80 pr-10 pl-4 text-sm text-surface-900 placeholder:text-surface-500 backdrop-blur-md transition-colors focus:border-violet-400/60 focus:bg-white/90 focus:outline-none focus:ring-2 focus:ring-violet-400/25"
          />
        </div>
      </div>

      {/* Results count */}
      <p className="text-sm text-surface-600">
        {isLoading ? (
          <Loader2 className="inline h-3 w-3 animate-spin" />
        ) : (
          <>
            <span className="font-medium text-surface-700 number">
              {data?.total ?? 0}
            </span>{" "}
            לקוחות
          </>
        )}
      </p>

      {/* Customer list */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i} padding="sm">
              <div className="flex items-center gap-6">
                <div className="h-11 w-11 animate-pulse rounded-full bg-white/60" />
                <div className="space-y-2 flex-1">
                  <div className="h-4 w-32 animate-pulse rounded bg-white/60" />
                  <div className="h-3 w-24 animate-pulse rounded bg-white/50" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : customers.length === 0 ? (
        <EmptyState
          icon={Users}
          title="לא נמצאו לקוחות"
          description="נסו לשנות את החיפוש או לייבא קובץ חדש"
        />
      ) : (
        <div className="space-y-2">
          {customers.map((customer) => (
            <Link key={customer.id} href={`/customers/${customer.id}`}>
              <Card
                padding="sm"
                className="cursor-pointer transition-all hover:border-primary-200 hover:shadow-sm"
              >
                <div className="flex items-center justify-between">
                  {/* Customer info */}
                  <div className="flex items-center gap-5">
                    {/* Avatar — Prism gradient disc */}
                    <div
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/40 text-white"
                      style={{
                        background:
                          "linear-gradient(135deg, #818CF8 0%, #A78BFA 55%, #F0ABFC 100%)",
                        boxShadow:
                          "0 1px 0 rgba(255,255,255,0.55) inset, " +
                          "0 4px 12px -4px rgba(167,139,250,0.45)",
                      }}
                    >
                      <span className="text-sm font-medium">
                        {(customer.firstName || "?")[0]}
                        {(customer.lastName || "?")[0]}
                      </span>
                    </div>

                    {/* Name & ID */}
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-surface-900">
                        {customer.firstName} {customer.lastName}
                      </h3>
                      <p className="text-xs text-surface-600 number">
                        ת.ז. {customer.israeliId}
                      </p>
                    </div>
                  </div>

                  {/* Right side — metrics */}
                  <div className="flex items-center gap-6">
                    {/* Policies */}
                    <div className="text-left hidden sm:block">
                      <p className="text-xs text-surface-600">פוליסות</p>
                      <p className="text-sm font-semibold text-surface-800 number">
                        {customer.policyCount}
                      </p>
                    </div>

                    {/* Insights */}
                    {customer.insightCount > 0 && (
                      <div className="flex items-center gap-1.5">
                        <Lightbulb className="h-3.5 w-3.5 text-accent-500" />
                        <span className="text-xs font-medium text-accent-700 number">
                          {customer.insightCount}
                        </span>
                      </div>
                    )}

                    {/* Top insight score */}
                    {customer.latestInsightScore != null && (
                      <Badge variant={getScoreTier(customer.latestInsightScore).color}>
                        <span className="number">{customer.latestInsightScore}</span>
                      </Badge>
                    )}

                    <ChevronLeft className="h-4 w-4 text-surface-300" />
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-surface-600">
            עמוד{" "}
            <span className="number font-medium text-surface-700">{data.page}</span>{" "}
            מתוך{" "}
            <span className="number font-medium text-surface-700">{data.totalPages}</span>
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPage(1)}
              disabled={data.page === 1}
            >
              <ChevronsRight className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={data.page === 1}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
              disabled={data.page === data.totalPages}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPage(data.totalPages)}
              disabled={data.page === data.totalPages}
            >
              <ChevronsLeft className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
