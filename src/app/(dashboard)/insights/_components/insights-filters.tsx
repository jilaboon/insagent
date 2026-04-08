"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { FilterPopover } from "@/components/shared/filter-popover";
import {
  insightCategoryLabels,
  branchLabels,
  urgencyLabels,
} from "@/lib/constants";
import type { InsightFilters } from "@/lib/types/insight";
import type { InsightCategory } from "@/generated/prisma/client";

// ============================================================
// Build filter options from constants
// ============================================================

const branchOptions = Object.entries(branchLabels).map(([value, label]) => ({
  value,
  label,
}));

const categoryOptions = Object.entries(insightCategoryLabels).map(
  ([value, label]) => ({ value, label })
);

const urgencyOptions = Object.entries(urgencyLabels).map(([value, label]) => ({
  value,
  label,
}));

// ============================================================
// Hook: read filters from URL search params
// ============================================================

export function useFiltersFromURL(): InsightFilters {
  const searchParams = useSearchParams();

  return {
    search: searchParams.get("search") || undefined,
    branch: searchParams.getAll("branch").length
      ? (searchParams.getAll("branch") as ("LIFE" | "ELEMENTARY")[])
      : undefined,
    categories: searchParams.getAll("category").length
      ? (searchParams.getAll("category") as InsightCategory[])
      : undefined,
    urgency: searchParams.getAll("urgency").length
      ? searchParams.getAll("urgency").map(Number)
      : undefined,
    scoreMin: searchParams.get("scoreMin")
      ? Number(searchParams.get("scoreMin"))
      : undefined,
    scoreMax: searchParams.get("scoreMax")
      ? Number(searchParams.get("scoreMax"))
      : undefined,
    page: Number(searchParams.get("page") || "1"),
    limit: Number(searchParams.get("limit") || "50"),
    sortBy: searchParams.get("sortBy") || "strengthScore",
    sortDir: (searchParams.get("sortDir") || "desc") as "asc" | "desc",
  };
}

// ============================================================
// Component
// ============================================================

interface InsightsFiltersProps {
  className?: string;
}

export function InsightsFilters({ className }: InsightsFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [searchValue, setSearchValue] = useState(
    searchParams.get("search") || ""
  );

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      updateParam("search", searchValue || null);
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchValue]);

  const updateParam = useCallback(
    (key: string, value: string | string[] | null) => {
      const params = new URLSearchParams(searchParams.toString());
      params.delete(key);
      // Reset to page 1 when filters change
      if (key !== "page") params.set("page", "1");

      if (value === null || (Array.isArray(value) && value.length === 0)) {
        // param already deleted above
      } else if (Array.isArray(value)) {
        value.forEach((v) => params.append(key, v));
      } else {
        params.set(key, value);
      }

      startTransition(() => {
        router.replace(`?${params.toString()}`, { scroll: false });
      });
    },
    [router, searchParams, startTransition]
  );

  // Active filter pills
  const activeBranches = searchParams.getAll("branch");
  const activeCategories = searchParams.getAll("category");
  const activeUrgencies = searchParams.getAll("urgency");
  const hasActiveFilters =
    activeBranches.length > 0 ||
    activeCategories.length > 0 ||
    activeUrgencies.length > 0 ||
    !!searchParams.get("search");

  function clearAll() {
    startTransition(() => {
      router.replace("?page=1", { scroll: false });
    });
    setSearchValue("");
  }

  function removeFilter(key: string, value: string) {
    const current = searchParams.getAll(key).filter((v) => v !== value);
    updateParam(key, current.length ? current : null);
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative">
          <Search className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-surface-400" />
          <input
            type="text"
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            placeholder="חיפוש לקוח או תובנה..."
            className="h-8 w-56 rounded-lg border border-surface-300 bg-white pr-8 pl-3 text-xs text-surface-700 placeholder:text-surface-400 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-400"
          />
          {searchValue && (
            <button
              type="button"
              onClick={() => setSearchValue("")}
              className="absolute left-2 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* Filter dropdowns */}
        <FilterPopover
          label="ענף"
          options={branchOptions}
          selected={activeBranches}
          onChange={(val) => updateParam("branch", val)}
        />
        <FilterPopover
          label="קטגוריה"
          options={categoryOptions}
          selected={activeCategories}
          onChange={(val) => updateParam("category", val)}
        />
        <FilterPopover
          label="דחיפות"
          options={urgencyOptions}
          selected={activeUrgencies}
          onChange={(val) => updateParam("urgency", val)}
        />

        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearAll}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-surface-500 hover:bg-surface-50 hover:text-surface-700"
          >
            <X className="h-3 w-3" />
            נקה סינון
          </button>
        )}
      </div>

      {/* Active filter pills */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-1.5">
          {activeBranches.map((b) => (
            <FilterPill
              key={`branch-${b}`}
              label={branchLabels[b] || b}
              onRemove={() => removeFilter("branch", b)}
            />
          ))}
          {activeCategories.map((c) => (
            <FilterPill
              key={`cat-${c}`}
              label={
                insightCategoryLabels[c as InsightCategory] || c
              }
              onRemove={() => removeFilter("category", c)}
            />
          ))}
          {activeUrgencies.map((u) => (
            <FilterPill
              key={`urg-${u}`}
              label={`דחיפות: ${urgencyLabels[Number(u)] || u}`}
              onRemove={() => removeFilter("urgency", u)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Filter Pill
// ============================================================

function FilterPill({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-surface-100 px-2 py-0.5 text-xs font-medium text-surface-600">
      {label}
      <button
        type="button"
        onClick={onRemove}
        className="text-surface-400 hover:text-surface-600"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}
