/**
 * Column mapping for Har HaBituach "פוטנציאלים" Excel files.
 *
 * File format (confirmed from 2 real files provided by Rafi, Apr 2026):
 *   Sheet name: "פוטנציאלים"
 *   12 columns, all Hebrew headers:
 *     שם לקוח · מספר זיהוי · ענף ראשי · ענף משני · סוג מוצר ·
 *     חברה · תקופת ביטוח · פרמיה · סוג פרמיה · מספר פוליסה ·
 *     סיווג תוכנית · תאריך נכונות נתונים
 *
 * Each row represents ONE COVERAGE line — the same policy can appear
 * multiple times (e.g. car insurance appears twice: compulsory + comprehensive).
 * For v1 we dedup to one row per (customerId, policyNumber, insurer) and
 * skip coverage-level breakout (coverages table stays empty for external
 * policies until a future phase).
 */

import type { PolicyCategory } from "@prisma/client";

// Raw row as read from the xlsx — values can be strings, numbers, or null.
export type HarHabituachRawRow = Record<string, string | number | null>;

export interface HarHabituachNormalizedRow {
  // Customer identity
  israeliId: string;
  customerName: string | null;

  // Policy identity
  policyNumber: string;
  insurer: string;

  // Classification
  category: PolicyCategory;
  subType: string | null;
  productType: string | null;   // "פוליסת ביטוח" etc. (from סוג מוצר)
  planClass: string | null;     // "אישי" / "קבוצתי" / "קבוצתי קופת חולים"

  // Amounts
  premium: number | null;
  premiumPeriod: "ANNUAL" | "MONTHLY" | "ONE_TIME" | "UNKNOWN";
  premiumMonthly: number | null;
  premiumAnnual: number | null;

  // Dates
  startDate: Date | null;
  endDate: Date | null;
  dataFreshnessDate: Date | null;

  // Source row index, for error reporting
  sourceRowIndex: number;
}

const H_CUSTOMER_NAME = "שם לקוח";
const H_ISRAELI_ID = "מספר זיהוי";
const H_MAIN_BRANCH = "ענף ראשי";
const H_SUB_BRANCH = "ענף משני";
const H_PRODUCT_TYPE = "סוג מוצר";
const H_INSURER = "חברה";
const H_COVERAGE_PERIOD = "תקופת ביטוח";
const H_PREMIUM = "פרמיה";
const H_PREMIUM_TYPE = "סוג פרמיה";
const H_POLICY_NUMBER = "מספר פוליסה";
const H_PLAN_CLASS = "סיווג תוכנית";
const H_DATA_FRESHNESS = "תאריך נכונות נתונים";

export const HAR_HABITUACH_REQUIRED_HEADERS = [
  H_CUSTOMER_NAME,
  H_ISRAELI_ID,
  H_MAIN_BRANCH,
  H_INSURER,
  H_POLICY_NUMBER,
] as const;

/**
 * Map "ענף ראשי" string → PolicyCategory enum.
 * Accepts the exact Hebrew strings observed in Rafi's files.
 */
function inferCategory(
  mainBranch: string,
  subBranch: string | null
): PolicyCategory {
  const s = (mainBranch || "").trim();
  const sub = (subBranch || "").trim();

  if (s === "ביטוח רכב") return "PROPERTY";
  if (s === "ביטוח דירה") return "PROPERTY";
  if (s === "ביטוח עסק") return "PROPERTY";
  if (s === "ביטוח בריאות") return "HEALTH";
  if (s === "ביטוח סיעודי") return "HEALTH";
  if (s === "אבדן כושר עבודה") return "HEALTH";
  if (s === "ביטוח חיים") return "LIFE";
  if (s === "כתב שירות") {
    // Service attachments usually ride on a property/health policy. Use
    // the sub-branch to decide; default to PROPERTY (most common).
    if (sub.includes("בריאות") || sub.includes("רפואי")) return "HEALTH";
    return "PROPERTY";
  }
  return "PROPERTY";
}

/**
 * Parse the "תקופת ביטוח" string. Examples:
 *   "18/09/2024 - 31/08/2025"
 *   "01/01/2024 - 31/12/2025"
 *   "18/09/2024" (one-sided — treat as startDate only)
 *   "" or null
 */
function parseCoveragePeriod(value: string | null): {
  startDate: Date | null;
  endDate: Date | null;
} {
  if (!value) return { startDate: null, endDate: null };
  const parts = String(value).split(/\s*-\s*/).map((s) => s.trim()).filter(Boolean);
  const startDate = parts[0] ? parseDDMMYYYY(parts[0]) : null;
  const endDate = parts[1] ? parseDDMMYYYY(parts[1]) : null;
  return { startDate, endDate };
}

/** Parse DD/MM/YYYY → Date, or null if invalid. */
function parseDDMMYYYY(s: string): Date | null {
  if (!s) return null;
  const m = String(s).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const d = new Date(Date.UTC(parseInt(yyyy), parseInt(mm) - 1, parseInt(dd)));
  if (isNaN(d.getTime())) return null;
  return d;
}

function normalizeIsraeliId(raw: string | number | null): string | null {
  if (raw == null) return null;
  const s = String(raw).trim().replace(/\D/g, "");
  if (!s) return null;
  // Pad with leading zeros to 9 digits (standard ת.ז. length)
  return s.padStart(9, "0");
}

function cleanString(v: string | number | null): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function parseNumber(v: string | number | null): number | null {
  if (v == null) return null;
  if (typeof v === "number") return isFinite(v) ? v : null;
  const s = String(v).replace(/,/g, "").trim();
  if (s === "") return null;
  const n = parseFloat(s);
  return isFinite(n) ? n : null;
}

function normalizePremiumPeriod(
  v: string | null
): HarHabituachNormalizedRow["premiumPeriod"] {
  if (!v) return "UNKNOWN";
  const s = v.trim();
  if (s === "שנתית" || s === "שנתי") return "ANNUAL";
  if (s === "חודשית" || s === "חודשי") return "MONTHLY";
  if (s === "חד פעמית" || s === "חד פעמי") return "ONE_TIME";
  return "UNKNOWN";
}

/**
 * Map a raw xlsx row to a normalized record. Throws if mandatory fields
 * (israeliId, policyNumber, insurer) are missing — caller decides whether
 * to skip the row or fail the import.
 */
export function mapHarHabituachRow(
  row: HarHabituachRawRow,
  rowIndex: number
): HarHabituachNormalizedRow | null {
  const israeliId = normalizeIsraeliId(row[H_ISRAELI_ID]);
  const policyNumber = cleanString(row[H_POLICY_NUMBER]);
  const insurer = cleanString(row[H_INSURER]);

  // Mandatory fields — without these, the row is unusable
  if (!israeliId || !policyNumber || !insurer) return null;

  const mainBranch = cleanString(row[H_MAIN_BRANCH]) || "";
  const subBranch = cleanString(row[H_SUB_BRANCH]);
  const category = inferCategory(mainBranch, subBranch);

  const premium = parseNumber(row[H_PREMIUM]);
  const premiumPeriod = normalizePremiumPeriod(cleanString(row[H_PREMIUM_TYPE]));

  let premiumMonthly: number | null = null;
  let premiumAnnual: number | null = null;
  if (premium != null) {
    if (premiumPeriod === "MONTHLY") {
      premiumMonthly = premium;
      premiumAnnual = premium * 12;
    } else if (premiumPeriod === "ANNUAL") {
      premiumAnnual = premium;
      premiumMonthly = premium / 12;
    }
    // ONE_TIME / UNKNOWN: store as-is without allocation
  }

  const { startDate, endDate } = parseCoveragePeriod(
    cleanString(row[H_COVERAGE_PERIOD])
  );

  return {
    israeliId,
    customerName: cleanString(row[H_CUSTOMER_NAME]),
    policyNumber,
    insurer,
    category,
    subType: subBranch,
    productType: cleanString(row[H_PRODUCT_TYPE]),
    planClass: cleanString(row[H_PLAN_CLASS]),
    premium,
    premiumPeriod,
    premiumMonthly,
    premiumAnnual,
    startDate,
    endDate,
    dataFreshnessDate: parseDDMMYYYY(
      cleanString(row[H_DATA_FRESHNESS]) || ""
    ),
    sourceRowIndex: rowIndex,
  };
}
