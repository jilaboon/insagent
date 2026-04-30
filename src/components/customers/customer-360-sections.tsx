"use client";

import { useState } from "react";
import {
  Banknote,
  Building2,
  ChevronDown,
  FileText,
  Wallet,
} from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SourceBadge, type SourceKey } from "@/components/shared/source-badge";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import type { CustomerDetail } from "@/lib/api/hooks";

// ============================================================
// Phase 2 — Customer 360 sections
//
// Three rendered-but-loosely-coupled sections that sit beneath the
// existing two-column policies + journey grid:
//
//   1. PensionProvidentSection    — institutional Misleka products
//   2. DocumentsImportsSection    — chronological import timeline
//   3. BankingPlaceholderSection  — Phase 4 scaffolding
//
// Each section is self-contained: pass the relevant slice of
// `CustomerDetail` and it handles its own empty / populated rendering.
// ============================================================

// ============================================================
// Shared types
// ============================================================

type FinancialProduct = NonNullable<CustomerDetail["financialProducts"]>[number];
type ImportItem = NonNullable<CustomerDetail["imports"]>[number];

// ============================================================
// 1. Pension / Provident / Education Fund section
// ============================================================

export function PensionProvidentSection({
  products,
}: {
  products: FinancialProduct[] | undefined;
}) {
  const list = products ?? [];

  if (list.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>פנסיה, גמל והשתלמות</CardTitle>
        </CardHeader>
        <EmptyState
          icon={Building2}
          title="אין מוצרים מוסדיים"
          description="אין מוצרים מוסדיים שיובאו עבור לקוח זה. ניתן להעלות קבצי מסלקה מטאב היבוא."
        />
      </Card>
    );
  }

  // Group products by provider (preferring shortName when available so
  // sub-headers stay tight). We bucket by a stable key — provider id
  // when present, otherwise the resolved name — so two products from
  // the same provider always land in the same bucket even if one has a
  // null providerId.
  type ProviderGroup = {
    key: string;
    label: string;
    items: FinancialProduct[];
  };
  const groupMap = new Map<string, ProviderGroup>();
  for (const product of list) {
    const labelSource =
      product.providerShortName ?? product.providerName ?? "ספק לא מזוהה";
    const key = product.providerId ?? labelSource;
    const existing = groupMap.get(key);
    if (existing) {
      existing.items.push(product);
    } else {
      groupMap.set(key, { key, label: labelSource, items: [product] });
    }
  }
  const groups = Array.from(groupMap.values()).sort((a, b) =>
    a.label.localeCompare(b.label, "he-IL")
  );

  // Sort within each provider: active first, then by joinDate ascending.
  for (const group of groups) {
    group.items.sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      const ad = a.joinDate ? new Date(a.joinDate).getTime() : Infinity;
      const bd = b.joinDate ? new Date(b.joinDate).getTime() : Infinity;
      return ad - bd;
    });
  }

  const productCount = list.length;
  const providerCount = groups.length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>פנסיה, גמל והשתלמות</CardTitle>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full border border-surface-200 bg-surface-50 px-2 py-0.5 text-[11px] font-medium text-surface-600">
            <span className="number">{productCount}</span>
            <span>מוצרים</span>
            <span className="text-surface-300">·</span>
            <span className="number">{providerCount}</span>
            <span>גופים</span>
          </span>
          <SourceBadge source="MISLEKA" />
        </div>
      </CardHeader>
      <div className="space-y-6">
        {groups.map((group) => (
          <section
            key={group.key}
            aria-labelledby={`pension-group-${group.key}`}
          >
            <h4
              id={`pension-group-${group.key}`}
              className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-surface-700"
            >
              <Building2 className="h-3.5 w-3.5 text-indigo-500" />
              <span>{group.label}</span>
              <span className="text-surface-400 number">
                ({group.items.length})
              </span>
            </h4>
            <div className="grid gap-3 lg:grid-cols-2">
              {group.items.map((product) => (
                <FinancialProductCard key={product.id} product={product} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </Card>
  );
}

// ============================================================
// FinancialProductCard
// ============================================================

const STATUS_TONE: Record<
  string,
  { className: string }
> = {
  active: {
    className: "border-emerald-300/60 bg-emerald-500/10 text-emerald-700",
  },
  attention: {
    className: "border-amber-300/60 bg-amber-500/15 text-amber-800",
  },
  inactive: {
    className: "border-rose-300/60 bg-rose-500/10 text-rose-700",
  },
};

function pickStatusTone(product: FinancialProduct): keyof typeof STATUS_TONE {
  if (product.isActive) return "active";
  // Heuristic — flag arrears / loan as needs-attention even when not
  // strictly inactive, otherwise inactive bucket.
  if (product.hasArrears) return "attention";
  return "inactive";
}

function formatHebrewDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function FinancialProductCard({ product }: { product: FinancialProduct }) {
  const [expanded, setExpanded] = useState(false);
  const tone = pickStatusTone(product);
  const balance = product.totalBalanceAmount ?? product.latestBalance?.balanceAmount ?? null;
  const monthlyContribution = product.latestBalance?.monthlyContribution ?? null;

  // Date row prefers the explicit join date; falls back to the first
  // join date if provider only reports the latter.
  const joinDateRaw = product.joinDate ?? product.firstJoinDate;

  // Plan name often arrives right-padded with spaces. Trim trailing
  // whitespace so the line doesn't look broken; preserve internal
  // whitespace via whitespace-pre-wrap in case it carries meaning.
  const planName = product.planName?.replace(/\s+$/u, "") ?? null;

  const flagChips: { key: string; label: string; className: string }[] = [];
  if (product.hasLoan)
    flagChips.push({
      key: "loan",
      label: "הלוואה",
      className: "border-amber-300/60 bg-amber-500/10 text-amber-800",
    });
  if (product.hasArrears)
    flagChips.push({
      key: "arrears",
      label: "פיגור",
      className: "border-rose-300/60 bg-rose-500/10 text-rose-700",
    });
  if (product.hasBeneficiaries)
    flagChips.push({
      key: "beneficiaries",
      label: "מוטבים",
      className: "border-indigo-300/60 bg-indigo-500/10 text-indigo-700",
    });
  if (product.hasAttorney)
    flagChips.push({
      key: "attorney",
      label: "ייפוי כוח",
      className: "border-violet-300/60 bg-violet-500/10 text-violet-700",
    });

  const contentId = `pension-product-${product.id}-detail`;

  return (
    <div className="relative rounded-lg border border-surface-100 bg-white/40 p-4 backdrop-blur-sm">
      {/* Top metadata row */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-surface-800">
          {product.productTypeLabel ?? product.productTypeCode}
        </span>
        {product.interfaceType && (
          <span className="inline-flex items-center rounded-full border border-surface-200 bg-surface-50 px-2 py-0.5 text-[10px] font-medium text-surface-600 number">
            {product.interfaceType}
          </span>
        )}
        {product.statusLabel && (
          <span
            className={cn(
              "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium",
              STATUS_TONE[tone].className
            )}
          >
            {product.statusLabel}
          </span>
        )}
        <SourceBadge source="MISLEKA" />
      </div>

      {/* Plan name */}
      {planName && (
        <p className="mb-2 whitespace-pre-wrap text-base font-medium leading-snug text-surface-900">
          {planName}
        </p>
      )}

      {/* Insurer + policy number line */}
      <div className="mb-2 flex flex-wrap items-center gap-x-2 text-xs text-surface-500">
        {product.providerShortName && <span>{product.providerShortName}</span>}
        {product.providerShortName && product.policyOrAccountNumber && (
          <span aria-hidden>·</span>
        )}
        {product.policyOrAccountNumber && (
          <span className="number">{product.policyOrAccountNumber}</span>
        )}
      </div>

      {/* Date line */}
      {joinDateRaw && (
        <p className="text-[11px] text-surface-600">
          <span>הצטרפות: </span>
          <span className="number">{formatHebrewDate(joinDateRaw)}</span>
        </p>
      )}

      {/* Balance + valuation date */}
      {balance != null && (
        <div className="mt-3">
          <p className="text-lg font-semibold text-surface-900 number">
            {formatCurrency(balance)}
          </p>
          {product.valuationDate && (
            <span className="mt-1 inline-flex items-center rounded-full border border-surface-200 bg-surface-50 px-2 py-0.5 text-[10px] font-medium text-surface-600">
              <span>נכון לתאריך </span>
              <span className="number">
                {formatHebrewDate(product.valuationDate)}
              </span>
            </span>
          )}
        </div>
      )}

      {/* Monthly contribution */}
      {monthlyContribution != null && (
        <p className="mt-2 text-xs text-surface-600">
          <span>הפקדה חודשית: </span>
          <span className="number font-medium text-surface-800">
            {formatCurrency(monthlyContribution)}
          </span>
        </p>
      )}

      {/* Status flags */}
      {flagChips.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {flagChips.map((chip) => (
            <span
              key={chip.key}
              className={cn(
                "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium",
                chip.className
              )}
            >
              {chip.label}
            </span>
          ))}
        </div>
      )}

      {/* Employer line */}
      {product.employerName && (
        <p className="mt-2 text-[11px] text-surface-500">
          <span>מעסיק: </span>
          <span>{product.employerName}</span>
        </p>
      )}

      {/* Expand toggle */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-controls={contentId}
        className="mt-3 inline-flex items-center gap-1.5 rounded-md text-[11px] font-medium text-primary-700 hover:text-primary-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
      >
        <span>{expanded ? "סגור פירוט" : "צפה בפירוט"}</span>
        <ChevronDown
          className={cn(
            "h-3 w-3 transition-transform",
            expanded && "rotate-180"
          )}
        />
      </button>

      {expanded && (
        <div
          id={contentId}
          className="mt-3 space-y-2 border-t border-surface-100 pt-3 text-[11px] text-surface-600 animate-[fadeIn_0.15s_ease-out_forwards]"
        >
          <DetailRow label="מספר פוליסה / חשבון מלא">
            <span className="number">
              {product.policyOrAccountNumber ?? "—"}
            </span>
          </DetailRow>
          {product.unifiedProductCode && (
            <DetailRow label="קוד מוצר אחיד">
              <span className="number">{product.unifiedProductCode}</span>
            </DetailRow>
          )}
          <DetailRow label="תאריך הצטרפות למוצר">
            <span className="number">
              {formatHebrewDate(product.joinDate)}
            </span>
          </DetailRow>
          <DetailRow label="תאריך הצטרפות ראשון">
            <span className="number">
              {formatHebrewDate(product.firstJoinDate)}
            </span>
          </DetailRow>
          <DetailRow label="עדכון סטטוס אחרון">
            <span className="number">
              {formatHebrewDate(product.lastUpdatedDate)}
            </span>
          </DetailRow>
          {product.latestBalance && (
            <>
              <DetailRow label="הפקדת עובד">
                <span className="number">
                  {formatCurrency(product.latestBalance.employeeContribution)}
                </span>
              </DetailRow>
              <DetailRow label="הפקדת מעסיק">
                <span className="number">
                  {formatCurrency(product.latestBalance.employerContribution)}
                </span>
              </DetailRow>
              <DetailRow label="רכיב פיצויים">
                <span className="number">
                  {formatCurrency(
                    product.latestBalance.compensationComponent
                  )}
                </span>
              </DetailRow>
              <DetailRow label="תשואה מתחילת השנה">
                <span className="number">
                  {product.latestBalance.ytdReturn != null
                    ? `${product.latestBalance.ytdReturn.toFixed(2)}%`
                    : "—"}
                </span>
              </DetailRow>
            </>
          )}
          {product.sourceFileName && (
            <DetailRow label="קובץ מקור">
              <span className="number break-all">
                {product.sourceFileName}
              </span>
            </DetailRow>
          )}
        </div>
      )}
    </div>
  );
}

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-surface-500">{label}</span>
      <span className="text-left text-surface-800">{children}</span>
    </div>
  );
}

// ============================================================
// 2. Documents & Imports timeline
// ============================================================

const IMPORT_STATUS_LABELS: Record<
  string,
  { label: string; className: string }
> = {
  COMPLETED: {
    label: "הושלם",
    className: "border-emerald-300/60 bg-emerald-500/10 text-emerald-700",
  },
  PARTIAL: {
    label: "חלקי",
    className: "border-amber-300/60 bg-amber-500/15 text-amber-800",
  },
  FAILED: {
    label: "נכשל",
    className: "border-rose-300/60 bg-rose-500/10 text-rose-700",
  },
  PROCESSING: {
    label: "בעיבוד",
    className: "border-indigo-300/60 bg-indigo-500/10 text-indigo-700",
  },
  PENDING: {
    label: "ממתין",
    className: "border-surface-200 bg-surface-50 text-surface-500",
  },
};

function importSourceBadge(kind: string | null): SourceKey {
  switch (kind) {
    case "MISLEKA_XML":
      return "MISLEKA";
    case "HAR_HABITUACH":
      return "HAR_HABITUACH";
    case "BAFI_LIFE":
    case "BAFI_ELEMENTARY":
      return "OFFICE";
    default:
      return "OFFICE";
  }
}

export function DocumentsImportsSection({
  imports,
}: {
  imports: ImportItem[] | undefined;
}) {
  const list = imports ?? [];

  if (list.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>מסמכים וייבוא</CardTitle>
        </CardHeader>
        <EmptyState
          icon={FileText}
          title="אין יבואים שנקלטו"
          description="אין יבואים שנקלטו עבור הלקוח."
        />
      </Card>
    );
  }

  // Newest first by completedAt fallback createdAt.
  const sorted = [...list].sort((a, b) => {
    const at = new Date(a.completedAt ?? a.createdAt).getTime();
    const bt = new Date(b.completedAt ?? b.createdAt).getTime();
    return bt - at;
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>מסמכים וייבוא</CardTitle>
        <Badge variant="muted">
          <span className="number">{sorted.length}</span>
        </Badge>
      </CardHeader>
      <ul className="space-y-3">
        {sorted.map((item) => (
          <ImportRow key={item.id} item={item} />
        ))}
      </ul>
    </Card>
  );
}

function ImportRow({ item }: { item: ImportItem }) {
  const [expanded, setExpanded] = useState(false);
  const status =
    IMPORT_STATUS_LABELS[item.status] ?? {
      label: item.status,
      className: "border-surface-200 bg-surface-50 text-surface-500",
    };
  const badgeKey = importSourceBadge(item.kind);
  const dateIso = item.completedAt ?? item.createdAt;
  const isMisleka = item.kind === "MISLEKA_XML";
  const contentId = `import-row-${item.id}-detail`;

  // The filename can mix Hebrew (rare) with numbers and underscores.
  // We render the whole filename in a monospace span so digits and
  // path separators line up; Hebrew characters render fine in mono
  // fonts on the project's stack.
  return (
    <li className="rounded-lg border border-surface-100 bg-white/40 p-4 backdrop-blur-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div className="shrink-0 pt-0.5">
            <SourceBadge source={badgeKey} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-surface-800 number">
              {item.fileName}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-surface-500">
              <span
                className={cn(
                  "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium",
                  status.className
                )}
              >
                {status.label}
              </span>
              <span className="number">{formatDate(dateIso)}</span>
              {item.productCount > 0 && (
                <span className="number">
                  {item.productCount} מוצרים
                </span>
              )}
              {item.policyCount > 0 && (
                <span className="number">
                  {item.policyCount} פוליסות
                </span>
              )}
            </div>
            {isMisleka && item.providers.length > 0 && (
              <p className="mt-1 text-[11px] text-surface-500">
                <span>מ־</span>
                <span className="number">{item.providers.length}</span>
                <span> גופים: </span>
                <span>{item.providers.join(", ")}</span>
              </p>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-controls={contentId}
          className="shrink-0 rounded-md p-1 text-surface-500 hover:bg-surface-100 hover:text-surface-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
          title={expanded ? "סגור" : "הצג פרטים"}
        >
          <ChevronDown
            className={cn(
              "h-4 w-4 transition-transform",
              expanded && "rotate-180"
            )}
          />
        </button>
      </div>

      {expanded && (
        <div
          id={contentId}
          className="mt-3 space-y-2 border-t border-surface-100 pt-3 text-[11px] text-surface-600 animate-[fadeIn_0.15s_ease-out_forwards]"
        >
          <DetailRow label="זיהוי יבוא">
            <span className="number break-all">{item.id}</span>
          </DetailRow>
          <DetailRow label="סוג קובץ">
            <span>{item.fileType}</span>
          </DetailRow>
          <DetailRow label="נוצר">
            <span className="number">{formatDate(item.createdAt)}</span>
          </DetailRow>
          {item.completedAt && (
            <DetailRow label="הסתיים">
              <span className="number">{formatDate(item.completedAt)}</span>
            </DetailRow>
          )}
          {item.providers.length > 0 ? (
            <DetailRow label="גופים בקובץ">
              <span>{item.providers.join(", ")}</span>
            </DetailRow>
          ) : (
            <DetailRow label="התראות">
              <span>—</span>
            </DetailRow>
          )}
        </div>
      )}
    </li>
  );
}

// ============================================================
// 3. Banking placeholder section
// ============================================================

export function BankingPlaceholderSection() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>מידע בנקאי</CardTitle>
        <SourceBadge source="BANKING" />
      </CardHeader>
      <EmptyState
        icon={Wallet}
        title="מידע בנקאי טרם זמין"
        description="בעתיד יוצגו כאן נתוני עו״ש, הלוואות, התחייבויות ותזרים — בכפוף להרשאות ולחיבור מקור מידע בנקאי."
        action={
          <Button
            variant="secondary"
            size="sm"
            disabled
            title="יבוצע בשלב הבא"
            className="cursor-not-allowed"
          >
            <Banknote className="h-3.5 w-3.5" />
            הוסף מקור בנקאי
          </Button>
        }
      />
    </Card>
  );
}
