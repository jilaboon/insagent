// Mock data for development — will be replaced with real Prisma queries

export const mockDashboardStats = {
  pendingRecommendations: 12,
  expiringPolicies: 8,
  highOpportunityCustomers: 5,
  recentImports: 3,
  staleProfiles: 14,
  openTasks: 7,
};

export const mockRecentRecommendations = [
  {
    id: "1",
    customerName: "אבי אנצ׳יו",
    title: "חידוש ביטוח רכב",
    whyNow: "פג תוקף בעוד 47 יום",
    type: "POLICY_RENEWAL" as const,
    strengthLevel: 2 as const,
    urgencyLevel: 2 as const,
  },
  {
    id: "2",
    customerName: "רועי גבאי",
    title: "בדיקת כיסוי רכוש",
    whyNow: "לא זוהה ביטוח רכוש בנתונים שנקלטו",
    type: "COVERAGE_GAP_REVIEW" as const,
    strengthLevel: 2 as const,
    urgencyLevel: 1 as const,
  },
  {
    id: "3",
    customerName: "רועי גבאי",
    title: "עדכון נתוני פוליסת סיכון",
    whyNow: "נתונים עודכנו לאחרונה לפני 65 חודשים",
    type: "SERVICE_REVIEW" as const,
    strengthLevel: 1 as const,
    urgencyLevel: 2 as const,
  },
  {
    id: "4",
    customerName: "אבי אנצ׳יו",
    title: "סקירת ביטוח בריאות",
    whyNow: "לא זוהה כיסוי בריאות פעיל בנתונים שנקלטו",
    type: "COVERAGE_GAP_REVIEW" as const,
    strengthLevel: 1 as const,
    urgencyLevel: 1 as const,
  },
];

export const mockExpiringPolicies = [
  {
    id: "1",
    customerName: "אבי אנצ׳יו",
    policyType: "ביטוח רכב — מקיף",
    insurer: "שומרה",
    endDate: "2026-12-31",
    daysLeft: 270,
  },
  {
    id: "2",
    customerName: "אבי אנצ׳יו",
    policyType: "ביטוח דירה",
    insurer: "איילון",
    endDate: "2026-05-31",
    daysLeft: 56,
  },
];

export const mockCustomers = [
  {
    id: "1",
    firstName: "אבי",
    lastName: "אנצ׳יו",
    israeliId: "022268148",
    address: "משעול פלג 8, ראשון לציון",
    policyCategories: ["PROPERTY", "HEALTH", "SAVINGS"],
    totalMonthlyPremium: 1744,
    insurers: ["שומרה", "איילון", "כלל", "מנורה"],
    pendingRecommendations: 2,
    insightCount: 3,
    lastImportDate: "2026-04-05",
    profileCompleteness: 2 as const,
    dataFreshness: "2025-12-31",
  },
  {
    id: "2",
    firstName: "רועי",
    lastName: "גבאי",
    israeliId: "039184338",
    address: "מגדל עוז 5/16, מודיעין-מכבים-רעות",
    policyCategories: ["HEALTH", "PROVIDENT", "RISK"],
    totalMonthlyPremium: 368,
    insurers: ["הראל", "כלל"],
    pendingRecommendations: 3,
    insightCount: 4,
    lastImportDate: "2026-04-05",
    profileCompleteness: 1 as const,
    dataFreshness: "2020-12-31",
  },
];

export const policyCategoryLabels: Record<string, string> = {
  PROPERTY: "רכוש",
  HEALTH: "בריאות",
  LIFE: "חיים",
  PENSION: "פנסיה",
  SAVINGS: "חיסכון",
  RISK: "סיכון",
  PROVIDENT: "קרן השתלמות",
};

export const recommendationTypeLabels: Record<string, string> = {
  POLICY_RENEWAL: "חידוש פוליסה",
  COVERAGE_GAP_REVIEW: "בדיקת כיסוי",
  INACTIVITY_FOLLOWUP: "מעקב אי-פעילות",
  CROSS_SELL: "הרחבת כיסוי",
  DOCUMENT_FOLLOWUP: "מעקב מסמך",
  PREMIUM_OPTIMIZATION: "אופטימיזציית פרמיה",
  FAMILY_PROTECTION_REVIEW: "סקירת הגנה משפחתית",
  SERVICE_REVIEW: "סקירת שירות",
};
