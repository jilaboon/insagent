import type { InsightCategory } from "@prisma/client";

// ============================================================
// Policy Category Labels
// ============================================================

export const policyCategoryLabels: Record<string, string> = {
  PROPERTY: "רכוש",
  HEALTH: "בריאות",
  LIFE: "חיים",
  PENSION: "פנסיה",
  SAVINGS: "חיסכון",
  RISK: "סיכון",
  PROVIDENT: "גמל/השתלמות",
};

export const policyCategoryIcons: Record<string, string> = {
  PROPERTY: "🏠",
  HEALTH: "🏥",
  LIFE: "❤️",
  PENSION: "🏦",
  SAVINGS: "💰",
  RISK: "🛡️",
  PROVIDENT: "📊",
};

// ============================================================
// Policy Status Labels
// ============================================================

export const policyStatusLabels: Record<string, string> = {
  ACTIVE: "בתוקף",
  PROPOSAL: "הצעה",
  CANCELLED: "מבוטלת",
  EXPIRED: "פג תוקף",
  FROZEN: "מוקפאת",
  PAID_UP: "מסולקת",
  ARREARS: "בפיגור",
  UNKNOWN: "לא ידוע",
};

// ============================================================
// Insight Category Labels
// ============================================================

export const insightCategoryLabels: Record<InsightCategory, string> = {
  EXPIRING_POLICY: "פוליסה מתחדשת",
  SINGLE_CATEGORY: "ענף בודד",
  NO_PROPERTY: "חסר ביטוח רכוש",
  NO_HEALTH: "חסר ביטוח בריאות",
  STALE_DATA: "נתונים ישנים",
  PREMIUM_CONCENTRATION: "ריכוז פרמיה",
  NO_RECENT_CONTACT: "ללא קשר לאחרונה",
  FAMILY_NO_COVERAGE: "משפחה ללא כיסוי",
  HIGH_SAVINGS_LOW_PROTECTION: "חיסכון גבוה ללא הגנה",
  COVERAGE_GAP: "פער כיסוי",
  MANAGEMENT_FEE_HIGH: "דמי ניהול גבוהים",
  CROSS_SELL_OPPORTUNITY: "הזדמנות חיצונית",
  AGE_MILESTONE: "אבן דרך גילית",
  POLICY_AGE_REVIEW: "סקירת ותק פוליסה",
  DEPOSIT_GAP: "פער הפקדות",
  AI_GENERATED: "תובנת AI",
};

// ============================================================
// Branch Labels
// ============================================================

export const branchLabels: Record<string, string> = {
  LIFE: "חיים",
  ELEMENTARY: "אלמנטרי",
};

// ============================================================
// Recommendation Type Labels
// ============================================================

export const recommendationTypeLabels: Record<string, string> = {
  POLICY_RENEWAL: "חידוש פוליסה",
  COVERAGE_GAP_REVIEW: "סקירת פער כיסוי",
  INACTIVITY_FOLLOWUP: "מעקב חוסר פעילות",
  CROSS_SELL: "הרחבת סל",
  DOCUMENT_FOLLOWUP: "מעקב מסמך",
  PREMIUM_OPTIMIZATION: "אופטימיזציית פרמיה",
  FAMILY_PROTECTION_REVIEW: "סקירת הגנה משפחתית",
  SERVICE_REVIEW: "סקירת שירות",
};

// ============================================================
// Score Tiers
// ============================================================

export const scoreTiers = {
  strong: { min: 80, label: "חזק", color: "success" as const },
  medium: { min: 50, label: "בינוני", color: "warning" as const },
  low: { min: 0, label: "נמוך", color: "muted" as const },
} as const;

export function getScoreTier(score: number) {
  if (score >= 80) return scoreTiers.strong;
  if (score >= 50) return scoreTiers.medium;
  return scoreTiers.low;
}

// ============================================================
// Urgency Labels
// ============================================================

export const urgencyLabels: Record<number, string> = {
  0: "נמוך",
  1: "בינוני",
  2: "גבוה",
};

// ============================================================
// Message Status Labels
// ============================================================

export const messageStatusLabels: Record<string, string> = {
  none: "ללא הודעה",
  DRAFT: "טיוטה",
  APPROVED: "מאושר",
  SENT: "נשלח",
  SKIPPED: "דולג",
};

// ============================================================
// Insurer Name Normalization
// ============================================================

export const insurerNameMap: Record<string, string> = {
  כלל: "כלל",
  הפניקס: "הפניקס",
  הראל: "הראל",
  מגדל: "מגדל",
  מנורה: "מנורה",
  איילון: "איילון",
  שומרה: "שומרה",
  ביטוח: "ביטוח ישיר",
  "ביטוח ישיר": "ביטוח ישיר",
  הכשרה: "הכשרה",
};

// ============================================================
// BAFI Status Mapping
// ============================================================

export const bafiStatusMap: Record<string, string> = {
  בתוקף: "ACTIVE",
  הצעה: "PROPOSAL",
  מבוטלת: "CANCELLED",
  "פג תוקף": "EXPIRED",
  מוקפאת: "FROZEN",
  מסולקת: "PAID_UP",
  בפיגור: "ARREARS",
  אחר: "UNKNOWN",
  "לא רלוונטי": "UNKNOWN",
  "ריסק זמני": "ACTIVE",
  "ריסק זמני אוטומטי": "ACTIVE",
  "שמירת כיסוי ביטוחי": "ACTIVE",
  "תום ביטוח": "EXPIRED",
  פדיון: "CANCELLED",
};
