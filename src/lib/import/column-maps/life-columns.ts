/**
 * Column mapping for BAFI Life Insurance CSV export (חיים.csv)
 *
 * This file maps Hebrew column headers from the BAFI export to our internal
 * data model fields. The life CSV contains 183 columns covering:
 * - Customer identity and contact info
 * - Life insurance, health insurance, pension, savings, risk policies
 * - Investment tracks and management fees
 * - Employer contribution details
 */

import { parseHebrewDate, parseNumber, parseInteger, cleanString } from "../parse-csv";
import type { PolicyCategory, PolicyStatus } from "@/generated/prisma/client";
import { bafiStatusMap } from "@/lib/constants";

// ============================================================
// Types
// ============================================================

export interface LifeCustomerData {
  israeliId: string;
  fullName: string;
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
}

export interface LifePolicyData {
  policyNumber: string;
  insuranceType: string;
  productType: string | null;
  category: PolicyCategory;
  subType: string | null;
  status: PolicyStatus;
  insurer: string;
  insurerCode: string | null;
  productName: string | null;
  planName: string | null;
  startDate: Date | null;
  asOfDate: Date | null;
  premiumMonthly: number | null;
  premiumTotal: number | null;
  paymentFrequency: string | null;
  sumInsured: number | null;
  deathBenefit: number | null;
  accidentDeathBenefit: number | null;
  salary: number | null;
  accountType: string | null;
  employer: string | null;
  accumulatedSavings: number | null;
  projectedSavings: number | null;
  redemptionValue: number | null;
  trackAccumulation: number | null;
  investmentChannel: string | null;
  trackName: string | null;
  guaranteedSavingsPercent: number | null;
  managementFeeFromAccumulation: number | null;
  managementFeeFromPremium: number | null;
  firstJoinDate: Date | null;
  insurerName: string | null;
  // Employee contributions
  employeeContributionPercent: number | null;
  employeePremium: number | null;
  employerContributionPercent: number | null;
  employerPremium: number | null;
  severancePercent: number | null;
  severancePremium: number | null;
  lastDeposit: number | null;
}

export interface LifeNormalizedRow {
  customer: LifeCustomerData;
  policy: LifePolicyData;
  sourceRow: number;
}

// ============================================================
// Category inference
// ============================================================

function inferCategory(insuranceType: string, productType: string | null): PolicyCategory {
  const type = insuranceType?.trim() || "";
  const product = productType?.trim() || "";

  if (type === "בריאות") return "HEALTH";

  // Life branch — determine sub-category from product type
  if (product.includes("קרן פנסיה") || product.includes("פנסיה")) return "PENSION";
  if (product.includes("חיסכון טהור")) return "SAVINGS";
  if (product.includes("סיכון טהור")) return "RISK";
  if (product.includes("משולב חיסכון")) return "SAVINGS";
  if (product.includes("משכנתא")) return "LIFE";
  if (product.includes("קולקטיב")) return "RISK";

  return "LIFE";
}

function inferStatus(statusStr: string): PolicyStatus {
  const mapped = bafiStatusMap[statusStr?.trim() || ""];
  return (mapped as PolicyStatus) || "UNKNOWN";
}

// ============================================================
// Row mapper
// ============================================================

export function mapLifeRow(row: Record<string, string>, rowIndex: number): LifeNormalizedRow {
  const israeliId = cleanString(row["ת.ז."]) || "";
  const fullName = cleanString(row["שם מלא"]) || "";
  const firstName = cleanString(row["שם פרטי"]);

  // Find phone — try mobile first, then home
  let phone: string | null = null;
  for (let i = 1; i <= 8; i++) {
    const phoneVal = cleanString(row[`טלפון ${i}`]);
    const phoneType = cleanString(row[`סוג טלפון ${i}`]);
    if (phoneVal) {
      if (phoneType === "נייד") {
        phone = phoneVal;
        break;
      }
      if (!phone) phone = phoneVal;
    }
  }

  // Find address — prefer home address
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

  const insuranceType = cleanString(row["סוג ביטוח"]) || "";
  const productType = cleanString(row["סוג מוצר פנסיוני"]);
  const category = inferCategory(insuranceType, productType);

  // Extract insurer from company field or insurer name field
  const insurer = cleanString(row["שם יצרן"]) ||
    cleanString(row["חברה"]) ||
    cleanString(row["שם ביטוח"]) ||
    "";

  return {
    customer: {
      israeliId,
      fullName,
      firstName,
      age: parseInteger(row["גיל"]),
      dateOfBirth: parseHebrewDate(row["ת. לידה/התאגדות"] || row["ת.ל. מבוטח ראשי"] || ""),
      gender: cleanString(row["מין"]),
      maritalStatus: cleanString(row["מצב משפחתי"]),
      address,
      phone,
      email: cleanString(row['דוא"ל 1']),
      employer: cleanString(row["שם מעסיק (לקוח)"]) || cleanString(row["שם מעסיק (פוליסה)"]),
      handler: cleanString(row["שם מטפל"]),
    },
    policy: {
      policyNumber: cleanString(row["מס' פוליסה"]) || "",
      insuranceType,
      productType,
      category,
      subType: productType,
      status: inferStatus(row["סטטוס פוליסה"] || ""),
      insurer,
      insurerCode: cleanString(row["קוד מזהה יצרן"]),
      productName: cleanString(row["שם ביטוח"]),
      planName: cleanString(row["שם תכנית"]),
      startDate: parseHebrewDate(row["תחילת ביטוח"] || ""),
      asOfDate: parseHebrewDate(row["נכון ליום"] || ""),
      premiumMonthly: parseNumber(row["פרמיה"]),
      premiumTotal: parseNumber(row["פרמיה מהצעה"]),
      paymentFrequency: cleanString(row["תדירות תשלום"]),
      sumInsured: parseNumber(row["סכום ביטוח"]),
      deathBenefit: parseNumber(row["סכום למקרה מוות"]),
      accidentDeathBenefit: parseNumber(row["סכום למקרה מוות מתאונה"]),
      salary: parseNumber(row["משכורת"]),
      accountType: cleanString(row["סוג תוכנית/חשבון"]),
      employer: cleanString(row["שם מעסיק (פוליסה)"]),
      accumulatedSavings: parseNumber(row["סה\"כ סכום חיסכון מצטבר"]),
      projectedSavings: parseNumber(row["צבירת חיסכון חזויה"]),
      redemptionValue: parseNumber(row["סה\"כ ערכי פדיון"]),
      trackAccumulation: parseNumber(row["סכום צבירה במסלול"]),
      investmentChannel: cleanString(row["אפיק השקע"]),
      trackName: cleanString(row["שם מסלול"]),
      guaranteedSavingsPercent: parseNumber(row["אחוז חסכון מובטח"]),
      managementFeeFromAccumulation: parseNumber(row["דמי ניהול מצבירה%"]),
      managementFeeFromPremium: parseNumber(row["דמי ניהול מפרמיה%"]),
      firstJoinDate: parseHebrewDate(row["תאריך הצטרפות לראשונה"] || ""),
      insurerName: cleanString(row["שם יצרן"]),
      employeeContributionPercent: parseNumber(row["הפרשות עובד %"]),
      employeePremium: parseNumber(row["פרמיה עובד ₪"]),
      employerContributionPercent: parseNumber(row["הפרשות מעביד %"]),
      employerPremium: parseNumber(row["פרמיה מעביד ₪"]),
      severancePercent: parseNumber(row["פיצויים מעביד %"]),
      severancePremium: parseNumber(row["₪ פיצויים מעביד"]),
      lastDeposit: parseNumber(row["סה\"כ הפקדה אחרונה"]),
    },
    sourceRow: rowIndex,
  };
}
