/**
 * Column mapping for BAFI Elementary Insurance CSV export (_06-04-2026.csv)
 *
 * This file maps Hebrew column headers from the BAFI export to our internal
 * data model fields. The elementary CSV contains 133 columns covering:
 * - Customer identity and contact info
 * - Vehicle insurance (comprehensive, mandatory, third-party)
 * - Property insurance (home, business, mortgage)
 * - Professional liability, contractors, etc.
 */

import { parseHebrewDate, parseNumber, parseInteger, cleanString } from "../parse-csv";
import type { PolicyCategory, PolicyStatus } from "@/generated/prisma/client";

// ============================================================
// Types
// ============================================================

export interface ElementaryCustomerData {
  israeliId: string;
  firstName: string | null;
  age: number | null;
  dateOfBirth: Date | null;
  gender: string | null;
  maritalStatus: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  employer: string | null;
  handler: string | null;
  insuredType: string | null; // פרטי / חברה
}

export interface ElementaryPolicyData {
  policyNumber: string;
  branchName: string;
  insuranceType: string | null;
  policyType: string | null;
  category: PolicyCategory;
  subType: string | null;
  status: PolicyStatus;
  insurer: string;
  startDate: Date | null;
  endDate: Date | null;
  premium: number | null;
  paymentCount: number | null;
  renewalType: string | null;
  currency: string | null;
  // Vehicle fields
  vehicleNumber: string | null;
  vehicleType: string | null;
  vehicleYear: number | null;
  vehicleModel: string | null;
  chassisNumber: string | null;
  engineVolume: string | null;
  allowedDrivers: string | null;
  protectionLevel: string | null;
  // Property-specific
  accountHolder: string | null;
}

export interface ElementaryNormalizedRow {
  customer: ElementaryCustomerData;
  policy: ElementaryPolicyData;
  sourceRow: number;
}

// ============================================================
// Category inference from branch name
// ============================================================

const vehicleBranches = [
  "רכב", "רכב חובה", "רכב קסקו", "רכב פרטי", "ביטוח חובה",
  "משאיות", "נגררים", "רכב מיוחד", "טרקטורים", "קסקו",
  "צמ\"ה", "ציוד מכני", "שירותי דרך", "קגב", "מקיף",
];

const propertyBranches = [
  "דירה", "דירות", "בית", "משכנתא", "מבנה",
  "בית משותף", "אלומה",
];

const businessBranches = [
  "עסק", "בתי עסק", "חנויות", "משרד", "מטריה",
  "סחורה", "קבלנות", "קבלנים", "עבודות",
  "חבות", "חבויות", "אחריות", "א.מקצועית",
];

function inferElementaryCategory(branchName: string): PolicyCategory {
  const branch = branchName?.trim().toLowerCase() || "";

  for (const vb of vehicleBranches) {
    if (branch.includes(vb.toLowerCase())) return "PROPERTY";
  }
  for (const pb of propertyBranches) {
    if (branch.includes(pb.toLowerCase())) return "PROPERTY";
  }
  for (const bb of businessBranches) {
    if (branch.includes(bb.toLowerCase())) return "PROPERTY";
  }

  return "PROPERTY"; // Elementary is always PROPERTY category
}

function inferElementarySubType(branchName: string, insuranceType: string | null): string {
  const branch = branchName?.trim().toLowerCase() || "";
  const type = insuranceType?.trim().toLowerCase() || "";

  if (branch.includes("רכב") || branch.includes("חובה") || branch.includes("קסקו") ||
      branch.includes("משאיות") || branch.includes("נגררים") ||
      type.includes("חובה") || type.includes("מקיף")) {
    return "רכב";
  }
  if (branch.includes("דירה") || branch.includes("דירות") || branch.includes("בית") ||
      branch.includes("משכנתא") || branch.includes("מבנה")) {
    return "דירה";
  }
  if (branch.includes("עסק") || branch.includes("חנויות") || branch.includes("משרד")) {
    return "עסק";
  }
  if (branch.includes("קבלנ") || branch.includes("עבודות")) {
    return "קבלנות";
  }
  if (branch.includes("חבו") || branch.includes("אחריות") || branch.includes("מקצועית")) {
    return "חבויות";
  }
  if (branch.includes("צמ") || branch.includes("ציוד מכני") || branch.includes("טרקטור")) {
    return "צמ\"ה";
  }

  return branchName?.trim() || "אחר";
}

function inferElementaryStatus(statusStr: string): PolicyStatus {
  const s = statusStr?.trim() || "";
  if (s === "לא טופל" || s === "נשלח מכתב חידוש" || s === "בטיפול") return "ACTIVE";
  if (s.includes("לא חודש")) return "EXPIRED";
  return "ACTIVE"; // Elementary defaults to active (policies in the export are current)
}

// ============================================================
// Row mapper
// ============================================================

export function mapElementaryRow(row: Record<string, string>, rowIndex: number): ElementaryNormalizedRow {
  const israeliId = cleanString(row["ת.ז."]) || "";
  const firstName = cleanString(row["שם פרטי"]);

  // Find phone — try mobile first
  let phone: string | null = null;
  for (let i = 1; i <= 8; i++) {
    const phoneVal = cleanString(row[`טלפון ${i}`]);
    const phoneType = cleanString(row[`סוג טלפון ${i}`]);
    if (phoneVal) {
      if (phoneType === "נייד") {
        phone = phoneVal;
        break;
      }
      if (!phone && phoneType !== "פקס בבית") phone = phoneVal;
    }
  }

  // Find address — prefer home
  let address: string | null = null;
  for (let i = 1; i <= 3; i++) {
    const addrVal = cleanString(row[`כתובת ${i}`]);
    const addrType = cleanString(row[`סוג כתובת ${i}`]);
    if (addrVal) {
      if (addrType === "בית") {
        address = addrVal;
        break;
      }
      if (!address) address = addrVal;
    }
  }

  const branchName = cleanString(row["שם ענף"]) || "";
  const insuranceType = cleanString(row["סוג ביטוח"]);

  return {
    customer: {
      israeliId,
      firstName,
      age: parseInteger(row["גיל"]),
      dateOfBirth: parseHebrewDate(row["ת. לידה/התאגדות"] || ""),
      gender: cleanString(row["מין"]),
      maritalStatus: cleanString(row["מצב משפחתי"]),
      address,
      phone,
      email: cleanString(row['דוא"ל 1']),
      employer: cleanString(row["שם מעסיק (לקוח)"]),
      handler: cleanString(row["שם מטפל"]),
      insuredType: cleanString(row["סוג מבוטח"]),
    },
    policy: {
      policyNumber: cleanString(row["מס' פוליסה"]) || "",
      branchName,
      insuranceType,
      policyType: cleanString(row["סוג פוליסה"]),
      category: inferElementaryCategory(branchName),
      subType: inferElementarySubType(branchName, insuranceType),
      status: inferElementaryStatus(row["סטטוס"] || ""),
      insurer: cleanString(row["חברה"]) || "",
      startDate: parseHebrewDate(row["תחילת ביטוח"] || ""),
      endDate: parseHebrewDate(row["סיום ביטוח"] || ""),
      premium: parseNumber(row["פרמיה"]),
      paymentCount: parseInteger(row["מס' תשלומים"]),
      renewalType: cleanString(row["סוג חידוש"]),
      currency: cleanString(row["סוג מטבע"]),
      vehicleNumber: cleanString(row["מס' רכב"]),
      vehicleType: cleanString(row["סוג רכב"]),
      vehicleYear: parseInteger(row["שנת יצור"]),
      vehicleModel: cleanString(row["קוד דגם"]),
      chassisNumber: cleanString(row["מס' שלדה"]),
      engineVolume: cleanString(row["נפח/משקל"]),
      allowedDrivers: cleanString(row["רשאים לנהוג"]),
      protectionLevel: cleanString(row["רמת מיגון"]),
      accountHolder: cleanString(row["שם בעל חשבון"]),
    },
    sourceRow: rowIndex,
  };
}
