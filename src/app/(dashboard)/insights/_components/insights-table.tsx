"use client";

import { useMemo, useState, Fragment } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import {
  useReactTable,
  getCoreRowModel,
  getExpandedRowModel,
  flexRender,
  type ColumnDef,
} from "@tanstack/react-table";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UrgencyIndicator } from "@/components/ui/indicators";
import { NeonRing } from "@/components/prism/neon-ring";
import {
  insightCategoryLabels,
  branchLabels,
  messageStatusLabels,
} from "@/lib/constants";
import { useInsights, type PaginatedInsights } from "@/lib/api/hooks";
import type { InsightDetail } from "@/lib/types/insight";
import type { InsightCategory } from "@prisma/client";
import { InsightRowDetail } from "./insight-row-detail";
import { useFiltersFromURL } from "./insights-filters";

// ============================================================
// Column definitions
// ============================================================

function createColumns(): ColumnDef<InsightDetail, unknown>[] {
  return [
    // Expand chevron
    {
      id: "expand",
      size: 36,
      header: () => null,
      cell: ({ row }) => (
        <button
          type="button"
          onClick={row.getToggleExpandedHandler()}
          className="flex h-6 w-6 items-center justify-center rounded text-surface-400 hover:bg-surface-100 hover:text-surface-600"
        >
          <ChevronDown
            className={cn(
              "h-4 w-4 transition-transform",
              row.getIsExpanded() && "rotate-180"
            )}
          />
        </button>
      ),
    },
    // Customer — name links to the customer card so the agent can
    // jump straight from an insight row to the full profile.
    {
      id: "customer",
      header: "לקוח",
      size: 180,
      cell: ({ row }) => (
        <div className="min-w-0">
          <Link
            href={`/customers/${row.original.customerId}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="group inline-flex items-center gap-1 truncate text-sm font-medium text-surface-900 hover:text-violet-700"
            title="פתח כרטיס לקוח"
          >
            <span className="truncate">{row.original.customerName}</span>
            <ExternalLink className="h-3 w-3 shrink-0 text-surface-400 group-hover:text-violet-600" />
          </Link>
          <p className="truncate text-xs text-surface-500 number">
            {row.original.customerIsraeliId}
          </p>
        </div>
      ),
    },
    // Title
    {
      accessorKey: "title",
      header: "תובנה",
      size: 240,
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate text-sm text-surface-800">
            {row.original.title}
          </p>
          <p className="truncate text-xs text-surface-500">
            {row.original.summary}
          </p>
        </div>
      ),
    },
    // Score — small NeonRing, auto-colored by value tier
    {
      accessorKey: "strengthScore",
      header: "ציון",
      size: 80,
      cell: ({ row }) => {
        const score = row.original.strengthScore;
        return <NeonRing value={score} size={32} strokeWidth={2.5} />;
      },
    },
    // Category
    {
      accessorKey: "category",
      header: "קטגוריה",
      size: 140,
      cell: ({ row }) => (
        <Badge variant="info">
          {insightCategoryLabels[row.original.category as InsightCategory] ||
            row.original.category}
        </Badge>
      ),
    },
    // Branch
    {
      accessorKey: "branch",
      header: "ענף",
      size: 90,
      cell: ({ row }) => (
        <Badge variant="default">
          {branchLabels[row.original.branch] || row.original.branch}
        </Badge>
      ),
    },
    // Urgency
    {
      accessorKey: "urgencyLevel",
      header: "דחיפות",
      size: 90,
      cell: ({ row }) => (
        <UrgencyIndicator level={row.original.urgencyLevel as 0 | 1 | 2} />
      ),
    },
    // Message status
    {
      id: "messageStatus",
      header: "הודעה",
      size: 90,
      cell: ({ row }) => {
        const status = row.original.messageStatus;
        const variant =
          status === "approved" || status === "sent"
            ? "success"
            : status === "draft"
              ? "warning"
              : "muted";
        return (
          <Badge variant={variant}>
            {messageStatusLabels[status] ?? messageStatusLabels[status.toUpperCase()] ?? status}
          </Badge>
        );
      },
    },
  ];
}

// ============================================================
// Component
// ============================================================

interface InsightsTableProps {
  className?: string;
}

export function InsightsTable({ className }: InsightsTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = useFiltersFromURL();
  const { data, isLoading } = useInsights(filters);

  const columns = useMemo(() => createColumns(), []);
  const items = data?.items ?? [];

  const table = useReactTable({
    data: items,
    columns,
    getRowId: (row) => row.id,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getRowCanExpand: () => true,
    manualPagination: true,
    manualSorting: true,
    pageCount: data?.totalPages ?? 0,
    state: {
      pagination: {
        pageIndex: (data?.page ?? 1) - 1,
        pageSize: data?.limit ?? 50,
      },
    },
  });

  // Sort handler
  function handleSort(columnKey: string) {
    const params = new URLSearchParams(searchParams.toString());
    const currentSort = params.get("sortBy");
    const currentDir = params.get("sortDir") || "desc";

    if (currentSort === columnKey) {
      params.set("sortDir", currentDir === "desc" ? "asc" : "desc");
    } else {
      params.set("sortBy", columnKey);
      params.set("sortDir", "desc");
    }
    params.set("page", "1");
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  // Page handler
  function goToPage(page: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(page));
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  const sortableColumns = ["strengthScore", "urgencyLevel", "createdAt"];

  return (
    <div className={cn("space-y-3", className)}>
      <div className="overflow-x-auto rounded-[20px] border border-white/65 bg-white/75 backdrop-blur-xl backdrop-saturate-150 shadow-[0_1px_0_rgba(255,255,255,0.9)_inset,0_10px_30px_-14px_rgba(80,70,180,0.18),0_2px_8px_-2px_rgba(80,70,180,0.08)]">
        <table className="w-full text-right">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b border-white/70">
                {headerGroup.headers.map((header) => {
                  const isSortable = sortableColumns.includes(header.column.id);
                  const isCurrentSort =
                    filters.sortBy === header.column.id;

                  return (
                    <th
                      key={header.id}
                      className={cn(
                        "px-3 py-2.5 text-xs font-semibold text-surface-600",
                        isSortable && "cursor-pointer select-none hover:text-surface-800"
                      )}
                      style={{ width: header.getSize() }}
                      onClick={
                        isSortable
                          ? () => handleSort(header.column.id)
                          : undefined
                      }
                    >
                      <span className="inline-flex items-center gap-1">
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                        {isSortable &&
                          (isCurrentSort ? (
                            filters.sortDir === "asc" ? (
                              <ArrowUp className="h-3 w-3" />
                            ) : (
                              <ArrowDown className="h-3 w-3" />
                            )
                          ) : (
                            <ArrowUpDown className="h-3 w-3 opacity-40" />
                          ))}
                      </span>
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="border-b border-white/50">
                  {columns.map((_, ci) => (
                    <td key={ci} className="px-3 py-3">
                      <div className="h-4 animate-pulse rounded bg-white/60" />
                    </td>
                  ))}
                </tr>
              ))
            ) : items.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-6 py-12 text-center text-sm text-surface-600"
                >
                  לא נמצאו תובנות
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <Fragment key={row.id}>
                  <tr
                    className={cn(
                      "border-b border-white/50 transition-colors hover:bg-white/40",
                      row.getIsExpanded() && "bg-white/40"
                    )}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-3 py-2.5">
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </td>
                    ))}
                  </tr>
                  {row.getIsExpanded() && (
                    <tr>
                      <td colSpan={columns.length} className="p-0">
                        <InsightRowDetail insight={row.original} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-surface-500">
            עמוד{" "}
            <span className="number font-medium text-surface-700">
              {data.page}
            </span>{" "}
            מתוך{" "}
            <span className="number font-medium text-surface-700">
              {data.totalPages}
            </span>{" "}
            ({" "}
            <span className="number font-medium text-surface-700">
              {data.total}
            </span>{" "}
            תובנות)
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => goToPage(1)}
              disabled={data.page === 1}
            >
              <ChevronsRight className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => goToPage(data.page - 1)}
              disabled={data.page === 1}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => goToPage(data.page + 1)}
              disabled={data.page === data.totalPages}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => goToPage(data.totalPages)}
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
