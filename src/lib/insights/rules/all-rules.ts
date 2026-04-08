/**
 * All 18 deterministic insight rules.
 * Each rule maps to one of רפי's tips or a cross-sell/optimization opportunity.
 */

import type { InsightRule, CustomerProfile, RuleResult } from "./types";

// Helper: calculate years since a date
function yearsSince(date: Date | null | undefined): number | null {
  if (!date) return null;
  const d = new Date(date);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  return (now.getTime() - d.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
}

function daysSince(date: Date | null | undefined): number | null {
  if (!date) return null;
  const d = new Date(date);
  if (isNaN(d.getTime())) return null;
  return (new Date().getTime() - d.getTime()) / (24 * 60 * 60 * 1000);
}

function daysUntil(date: Date | null | undefined): number | null {
  if (!date) return null;
  const d = new Date(date);
  if (isNaN(d.getTime())) return null;
  return (d.getTime() - new Date().getTime()) / (24 * 60 * 60 * 1000);
}

// ============================================================
// Rule 1: New vehicle — original parts coverage (רפי tip #1)
// ============================================================
const newVehicleOriginalParts: InsightRule = {
  id: "new-vehicle-original-parts",
  name: "חלקים מקוריים לרכב חדש",
  category: "COVERAGE_GAP",
  evaluate(profile: CustomerProfile): RuleResult | null {
    const vehiclePolicies = profile.activePolicies.filter(
      (p) => p.category === "PROPERTY" && p.vehicleYear
    );
    const currentYear = new Date().getFullYear();

    for (const p of vehiclePolicies) {
      if (p.vehicleYear && currentYear - p.vehicleYear <= 2) {
        return {
          ruleId: this.id,
          category: this.category,
          title: "רכב חדש — בקש שמשות, פנסים ומראות מקוריים",
          summary: `הרכב שנת ${p.vehicleYear} — בגלל מערכות הבטיחות, כדאי לוודא כיסוי לחלקים מקוריים`,
          explanation: "ברכבים חדשים מערכות הבטיחות תלויות בשמשות, פנסים ומראות מקוריים. חלפים תחליפיים עלולים לפגוע בפעולת המערכות.",
          whyNow: `הרכב בן ${currentYear - p.vehicleYear} שנים — עדיין בטווח שבו חלפים מקוריים קריטיים`,
          urgencyLevel: 1,
          branch: "ELEMENTARY",
          evidence: { vehicleYear: p.vehicleYear, policyNumber: p.policyNumber, insurer: p.insurer },
          scoringHints: { financialImpact: 50, dataConfidence: 90, urgency: 40, actionClarity: 85, customerFit: 70 },
        };
      }
    }
    return null;
  },
};

// ============================================================
// Rule 2: Mortgage products from insurers (רפי tip #2)
// ============================================================
const mortgageProducts: InsightRule = {
  id: "mortgage-products",
  name: "מוצרי משכנתא מחברות ביטוח",
  category: "CROSS_SELL_OPPORTUNITY",
  evaluate(profile: CustomerProfile): RuleResult | null {
    const age = profile.customer.age;
    if (!age || age < 30 || age > 65) return null;

    const hasProperty = profile.activePolicies.some(
      (p) => p.category === "PROPERTY" && (p.subType?.includes("דירה") || p.propertyAddress)
    );
    if (!hasProperty) return null;

    return {
      ruleId: this.id,
      category: this.category,
      title: "חברות הביטוח מציעות מוצרי משכנתא",
      summary: "משכנתא הפוכה, משכנתא ל-40 שנה, הלוואה לכל מטרה — כדאי לבדוק",
      explanation: "חברות הביטוח נכנסו לעולם המשכנתאות עם מגוון מוצרים: משכנתא הפוכה מגיל 55, משכנתא ל-40 שנה, משכנתא לנכס להשקעה, והלוואות לכל מטרה.",
      whyNow: "שוק המשכנתאות משתנה — כדאי לבחון חלופות",
      urgencyLevel: 0,
      branch: "ELEMENTARY",
      evidence: { age, hasProperty: true },
      scoringHints: { financialImpact: 40, dataConfidence: 60, urgency: 20, actionClarity: 60, customerFit: 50 },
    };
  },
};

// ============================================================
// Rule 3: Check mortgage rates (רפי tip #3)
// ============================================================
const mortgageRateCheck: InsightRule = {
  id: "mortgage-rate-check",
  name: "בדיקת ריבית משכנתא",
  category: "COVERAGE_GAP",
  evaluate(profile: CustomerProfile): RuleResult | null {
    const mortgagePolicies = profile.activePolicies.filter(
      (p) => p.subType?.includes("משכנתא") || p.productName?.includes("משכנתא")
    );
    if (mortgagePolicies.length === 0) return null;

    const oldMortgage = mortgagePolicies.find((p) => {
      const years = yearsSince(p.startDate);
      return years && years >= 5;
    });
    if (!oldMortgage) return null;

    return {
      ruleId: this.id,
      category: this.category,
      title: "לא בדקת ריבית משכנתא ב-5 שנים?",
      summary: "עצור. קח ייעוץ משכנתאות דיגיטלי וחינם.",
      explanation: "אם לא בדקת את הריביות על המשכנתא שלך בחמש השנים האחרונות, יש סיכוי טוב שאפשר לחסוך.",
      whyNow: `פוליסת משכנתא ${oldMortgage.policyNumber} פעילה מעל 5 שנים`,
      urgencyLevel: 1,
      branch: "LIFE",
      evidence: { policyNumber: oldMortgage.policyNumber, startDate: oldMortgage.startDate },
      scoringHints: { financialImpact: 70, dataConfidence: 75, urgency: 50, actionClarity: 80, customerFit: 65 },
    };
  },
};

// ============================================================
// Rule 4: Travel insurance timing (רפי tip #4)
// ============================================================
const travelInsuranceTiming: InsightRule = {
  id: "travel-insurance-timing",
  name: "ביטוח נסיעות לחו\"ל",
  category: "CROSS_SELL_OPPORTUNITY",
  evaluate(profile: CustomerProfile): RuleResult | null {
    // General tip — only show to active customers with some policies
    if (profile.activePolicies.length < 2) return null;

    // Check if it's travel season (spring/summer)
    const month = new Date().getMonth();
    if (month < 3 || month > 8) return null; // Only March-August

    return {
      ruleId: this.id,
      category: this.category,
      title: "אל תחכו עם ביטוח נסיעות לרגע האחרון",
      summary: "עשו את הביטוח עם רכישת הכרטיסים ותרוויחו כיסויים נוספים",
      explanation: "רכישת ביטוח נסיעות לחו\"ל יחד עם כרטיסי הטיסה מספקת כיסויים רחבים יותר מאשר רכישה ברגע האחרון.",
      whyNow: "עונת הטיסות — הזמן הנכון להזכיר",
      urgencyLevel: 0,
      branch: "ELEMENTARY",
      evidence: { month, activePolicies: profile.activePolicies.length },
      scoringHints: { financialImpact: 30, dataConfidence: 40, urgency: 30, actionClarity: 90, customerFit: 40 },
    };
  },
};

// ============================================================
// Rule 5: Life insurance price check (רפי tip #5)
// ============================================================
const lifeInsurancePriceCheck: InsightRule = {
  id: "life-insurance-price-check",
  name: "בדיקת מחיר ביטוח חיים",
  category: "POLICY_AGE_REVIEW",
  evaluate(profile: CustomerProfile): RuleResult | null {
    const lifePolicies = profile.activePolicies.filter(
      (p) => p.category === "LIFE" || p.category === "RISK"
    );

    for (const p of lifePolicies) {
      const years = yearsSince(p.startDate);
      if (years && years >= 3) {
        return {
          ruleId: this.id,
          category: this.category,
          title: "ביטוח חיים — לא בדקת מחיר 3 שנים?",
          summary: "ככל הנראה אתה משלם יקר. בדוק ותחסוך.",
          explanation: `פוליסת ביטוח חיים ${p.policyNumber} ב${p.insurer} פעילה מעל 3 שנים. מחירי השוק משתנים ויש סיכוי טוב לחיסכון.`,
          whyNow: `הפוליסה פעילה כבר ${Math.round(years)} שנים ללא בדיקת מחיר`,
          urgencyLevel: 1,
          branch: "LIFE",
          evidence: { policyNumber: p.policyNumber, insurer: p.insurer, startDate: p.startDate, yearsActive: Math.round(years) },
          scoringHints: { financialImpact: 65, dataConfidence: 85, urgency: 50, actionClarity: 80, customerFit: 75 },
        };
      }
    }
    return null;
  },
};

// ============================================================
// Rule 6: Health medication appendix (רפי tip #6)
// ============================================================
const healthMedicationAppendix: InsightRule = {
  id: "health-medication-appendix",
  name: "נספח תרופות מעודכן",
  category: "COVERAGE_GAP",
  evaluate(profile: CustomerProfile): RuleResult | null {
    const healthPolicies = profile.activePolicies.filter(
      (p) => p.category === "HEALTH"
    );

    for (const p of healthPolicies) {
      const years = yearsSince(p.startDate);
      if (years && years >= 3) {
        return {
          ruleId: this.id,
          category: this.category,
          title: "ביטוח רפואי ישן — בדוק נספח תרופות",
          summary: "שים לב שנספח התרופות שלך מעודכן — ישנן טכנולוגיות חדשות רבות",
          explanation: `ביטוח רפואי ${p.policyNumber} ב${p.insurer} פעיל מעל 3 שנים. נספחי תרופות מתעדכנים ויש טכנולוגיות חדשות שכדאי לוודא שהן מכוסות.`,
          whyNow: "עדכונים לנספחי תרופות יוצאים לעיתים קרובות",
          urgencyLevel: 1,
          branch: "LIFE",
          evidence: { policyNumber: p.policyNumber, insurer: p.insurer, yearsActive: Math.round(years) },
          scoringHints: { financialImpact: 55, dataConfidence: 80, urgency: 45, actionClarity: 75, customerFit: 70 },
        };
      }
    }
    return null;
  },
};

// ============================================================
// Rule 7: Accident — authorized garages (רפי tip #7)
// ============================================================
const accidentAuthorizedGarages: InsightRule = {
  id: "accident-authorized-garages",
  name: "מוסכי הסדר בלבד",
  category: "COVERAGE_GAP",
  evaluate(profile: CustomerProfile): RuleResult | null {
    const motorPolicies = profile.activePolicies.filter(
      (p) => p.category === "PROPERTY" && (p.subType === "רכב" || p.vehiclePlate)
    );
    if (motorPolicies.length === 0) return null;

    return {
      ruleId: this.id,
      category: this.category,
      title: "קרתה תאונה? רק מוסכי הסדר",
      summary: "חברות הביטוח עשויות לקזז כ-30% מהתביעה אם לא נכנסת למוסך הסדר",
      explanation: "בעת תאונה חובה להיכנס רק למוסכי הסדר. אחרת, חברות הביטוח רשאיות לקזז כ-30% מסכום התביעה, באישור המפקח על הביטוח.",
      whyNow: "מידע חשוב שכדאי להזכיר ללקוחות עם ביטוח רכב",
      urgencyLevel: 0,
      branch: "ELEMENTARY",
      evidence: { vehiclePolicies: motorPolicies.length },
      scoringHints: { financialImpact: 40, dataConfidence: 95, urgency: 20, actionClarity: 90, customerFit: 60 },
    };
  },
};

// ============================================================
// Rule 8: Rental property coverage (רפי tip #8)
// ============================================================
const rentalPropertyCoverage: InsightRule = {
  id: "rental-property-coverage",
  name: "דירה מושכרת — כיסוי שוכר",
  category: "COVERAGE_GAP",
  evaluate(profile: CustomerProfile): RuleResult | null {
    const propertyPolicies = profile.activePolicies.filter(
      (p) => p.category === "PROPERTY" && (p.subType === "דירה" || p.propertyAddress)
    );

    // If customer has multiple property policies, they might have a rental
    if (propertyPolicies.length < 2) return null;

    return {
      ruleId: this.id,
      category: this.category,
      title: "יש לך דירה מושכרת?",
      summary: "עדכן את סוכן הביטוח — וודא שגם השוכר עושה ביטוח תכולה + צד ג'",
      explanation: "אם יש לך דירה מושכרת, חשוב לעדכן את סוכן הביטוח ולוודא שהשוכר מבצע ביטוח תכולה וצד שלישי לדירה.",
      whyNow: `נמצאו ${propertyPolicies.length} פוליסות רכוש — יתכן שיש דירה מושכרת`,
      urgencyLevel: 0,
      branch: "ELEMENTARY",
      evidence: { propertyPolicies: propertyPolicies.length },
      scoringHints: { financialImpact: 45, dataConfidence: 50, urgency: 25, actionClarity: 70, customerFit: 45 },
    };
  },
};

// ============================================================
// Rule 9: Renovation insurance (רפי tip #10)
// ============================================================
const renovationInsurance: InsightRule = {
  id: "renovation-insurance",
  name: "שיפוץ — ביטוח דירה",
  category: "COVERAGE_GAP",
  evaluate(profile: CustomerProfile): RuleResult | null {
    const hasProperty = profile.activePolicies.some(
      (p) => p.category === "PROPERTY" && (p.subType === "דירה" || p.propertyAddress)
    );
    if (!hasProperty) return null;

    // Low priority general tip
    return {
      ruleId: this.id,
      category: this.category,
      title: "משפצים את הבית? הביטוח לא בתוקף",
      summary: "בתקופת שיפוץ, ביטוח הדירה עשוי לא לכסות — התייעצו עם הסוכן",
      explanation: "בעת שיפוץ, ביטוח הדירה הרגיל עשוי שלא להיות בתוקף. כדי לוודא כיסוי בתקופת השיפוץ, חשוב להתייעץ עם סוכן הביטוח.",
      whyNow: "מידע חשוב למי שמתכנן שיפוץ",
      urgencyLevel: 0,
      branch: "ELEMENTARY",
      evidence: { hasProperty: true },
      scoringHints: { financialImpact: 35, dataConfidence: 50, urgency: 15, actionClarity: 75, customerFit: 35 },
    };
  },
};

// ============================================================
// Rule 10: Stock exposure review (רפי tip #11)
// ============================================================
const stockExposureReview: InsightRule = {
  id: "stock-exposure-review",
  name: "בדיקת חשיפה למניות",
  category: "COVERAGE_GAP",
  evaluate(profile: CustomerProfile): RuleResult | null {
    const savingsPolicies = profile.activePolicies.filter(
      (p) =>
        (p.category === "SAVINGS" || p.category === "PENSION" || p.category === "PROVIDENT") &&
        (p.accumulatedSavings ?? 0) > 50000
    );
    if (savingsPolicies.length === 0) return null;

    const totalSavings = savingsPolicies.reduce(
      (sum, p) => sum + (p.accumulatedSavings || 0),
      0
    );

    return {
      ruleId: this.id,
      category: this.category,
      title: "בדקו את רמת החשיפה למניות",
      summary: `₪${Math.round(totalSavings).toLocaleString("he-IL")} בחיסכון — האם החשיפה למניות מתאימה?`,
      explanation: "אחרי שלוש שנים של עליות בבורסה, כדאי לבדוק האם נכון להפחית או להגדיל את רמת החשיפה למניות. אולי לשנות מסלול.",
      whyNow: "שוק ההון משתנה — הזמן לבחון את תמהיל ההשקעות",
      urgencyLevel: 1,
      branch: "LIFE",
      evidence: { totalSavings, savingsPoliciesCount: savingsPolicies.length },
      scoringHints: { financialImpact: 70, dataConfidence: 75, urgency: 55, actionClarity: 65, customerFit: 70 },
    };
  },
};

// ============================================================
// Rule 11: Pension stock component — young (רפי tip #12)
// ============================================================
const pensionStockComponent: InsightRule = {
  id: "pension-stock-component",
  name: "הגדלת רכיב מניות בפנסיה",
  category: "COVERAGE_GAP",
  evaluate(profile: CustomerProfile): RuleResult | null {
    const age = profile.customer.age;
    if (!age || age >= 50) return null;

    const pensionPolicies = profile.activePolicies.filter(
      (p) => p.category === "PENSION"
    );
    if (pensionPolicies.length === 0) return null;

    return {
      ruleId: this.id,
      category: this.category,
      title: "הפנסיה עוד רחוקה — שקלו להגדיל מניות",
      summary: "את הפנסיה תפגשו עוד עשרות שנים. שקלו להגדיל את רכיב המניות.",
      explanation: "למי שעוד רחוק מגיל הפרישה, מסלול השקעה עם חשיפה גבוהה יותר למניות עשוי להניב תשואות טובות יותר לטווח ארוך. אין בכך המלצה.",
      whyNow: `הלקוח בן ${age} — יש עוד ${67 - age} שנים עד פרישה`,
      urgencyLevel: 0,
      branch: "LIFE",
      evidence: { age, yearsToRetirement: 67 - age, pensionPolicies: pensionPolicies.length },
      scoringHints: { financialImpact: 55, dataConfidence: 70, urgency: 25, actionClarity: 60, customerFit: 65 },
    };
  },
};

// ============================================================
// Rule 12: Bank savings opportunity (רפי tip #14)
// ============================================================
const bankSavingsOpportunity: InsightRule = {
  id: "bank-savings-opportunity",
  name: "העברת כספים מהבנק",
  category: "CROSS_SELL_OPPORTUNITY",
  evaluate(profile: CustomerProfile): RuleResult | null {
    const hasSavings = profile.activePolicies.some(
      (p) => (p.category === "SAVINGS" || p.category === "PROVIDENT") && (p.accumulatedSavings ?? 0) > 0
    );
    // Only show if customer has some financial products but relatively modest savings
    if (!hasSavings && profile.totalAccumulatedSavings < 10000) return null;
    if (profile.activePolicies.length < 2) return null;

    return {
      ruleId: this.id,
      category: this.category,
      title: "תפסיקו לשחוק את הכסף שלכם בבנק",
      summary: "מסלולים כלליים של חברות הביטוח הניבו בממוצע מעל 10% תשואה",
      explanation: "בשנים האחרונות מסלולים כלליים של חברות הביטוח הניבו בממוצע מעל 10% תשואה שנתית. לא חבל על הכסף שיושב בפיקדון בנקאי?",
      whyNow: "פער התשואות בין בנקים לחברות ביטוח ממשיך להיות משמעותי",
      urgencyLevel: 0,
      branch: "LIFE",
      evidence: { currentSavings: profile.totalAccumulatedSavings },
      scoringHints: { financialImpact: 50, dataConfidence: 50, urgency: 25, actionClarity: 65, customerFit: 45 },
    };
  },
};

// ============================================================
// Rule 13: Retirement planning (רפי tip #15)
// ============================================================
const retirementPlanning: InsightRule = {
  id: "retirement-planning",
  name: "תכנון פרישה",
  category: "AGE_MILESTONE",
  evaluate(profile: CustomerProfile): RuleResult | null {
    const age = profile.customer.age;
    if (!age || age < 60) return null;

    return {
      ruleId: this.id,
      category: this.category,
      title: "הגעת לגיל 60 — זמן לתכנון פרישה",
      summary: "היפגש עם מתכנן פרישה כדי להגדיל את הפנסיה שלך",
      explanation: "בגיל 60 ומעלה, תכנון פרישה מקצועי יכול להגדיל משמעותית את הכנסת הפנסיה החודשית. כדאי להיפגש עם מתכנן פרישה.",
      whyNow: `הלקוח בן ${age} — נמצא בחלון הזמן לתכנון פרישה אפקטיבי`,
      urgencyLevel: age >= 65 ? 2 : 1,
      branch: "LIFE",
      evidence: { age, totalSavings: profile.totalAccumulatedSavings },
      scoringHints: {
        financialImpact: 85,
        dataConfidence: 90,
        urgency: age >= 65 ? 85 : 60,
        actionClarity: 80,
        customerFit: 90,
      },
    };
  },
};

// ============================================================
// Rule 14: No health coverage (cross-sell)
// ============================================================
const noHealthCoverage: InsightRule = {
  id: "no-health-coverage",
  name: "חסר ביטוח בריאות",
  category: "NO_HEALTH",
  evaluate(profile: CustomerProfile): RuleResult | null {
    const hasHealth = profile.activePolicies.some((p) => p.category === "HEALTH");
    if (hasHealth) return null;
    if (profile.activePolicies.length === 0) return null;

    return {
      ruleId: this.id,
      category: this.category,
      title: "לא נמצא ביטוח בריאות",
      summary: "ללקוח יש ביטוחים אחרים אך לא נמצא ביטוח בריאות פרטי",
      explanation: "ביטוח בריאות פרטי מספק כיסוי חשוב שמשלים את סל הבריאות הציבורי — ניתוחים, תרופות, ייעוץ מומחים.",
      whyNow: "פער כיסוי שכדאי לסגור",
      urgencyLevel: 1,
      branch: "LIFE",
      evidence: { policyCategories: Array.from(profile.categoryBreakdown.keys()) },
      scoringHints: { financialImpact: 60, dataConfidence: 85, urgency: 50, actionClarity: 80, customerFit: 70 },
    };
  },
};

// ============================================================
// Rule 15: Single category customer (cross-sell)
// ============================================================
const singleCategoryCustomer: InsightRule = {
  id: "single-category-customer",
  name: "לקוח עם ענף בודד",
  category: "SINGLE_CATEGORY",
  evaluate(profile: CustomerProfile): RuleResult | null {
    const activeCategories = new Set(profile.activePolicies.map((p) => p.category));
    if (activeCategories.size !== 1) return null;
    if (profile.activePolicies.length === 0) return null;

    const singleCategory = Array.from(activeCategories)[0];
    return {
      ruleId: this.id,
      category: this.category,
      title: "לקוח עם ענף ביטוח בודד",
      summary: `ללקוח יש ביטוח רק בענף אחד (${singleCategory}) — הזדמנות להרחבת הסל`,
      explanation: "לקוח שמרוכז בענף ביטוח אחד עשוי ליהנות מהרחבת הכיסוי לתחומים נוספים. זו הזדמנות לשיחה על צרכים נוספים.",
      whyNow: "ריכוז בענף אחד מעלה סיכון ומצביע על פוטנציאל",
      urgencyLevel: 0,
      branch: singleCategory === "PROPERTY" ? "ELEMENTARY" : "LIFE",
      evidence: { singleCategory, policyCount: profile.activePolicies.length },
      scoringHints: { financialImpact: 50, dataConfidence: 90, urgency: 30, actionClarity: 65, customerFit: 55 },
    };
  },
};

// ============================================================
// Rule 16: High management fees
// ============================================================
const highManagementFees: InsightRule = {
  id: "high-management-fees",
  name: "דמי ניהול גבוהים",
  category: "MANAGEMENT_FEE_HIGH",
  evaluate(profile: CustomerProfile): RuleResult | null {
    const highFeePolicies: Array<{ policyNumber: string; insurer: string; feePercent: number; savings: number }> = [];

    for (const p of profile.activePolicies) {
      if ((p.accumulatedSavings ?? 0) < 10000) continue;
      for (const fee of p.managementFees) {
        if (fee.feeType.includes("צבירה") && fee.ratePercent != null && fee.ratePercent > 1.0) {
          highFeePolicies.push({
            policyNumber: p.policyNumber,
            insurer: p.insurer,
            feePercent: fee.ratePercent,
            savings: p.accumulatedSavings || 0,
          });
        }
      }
    }

    if (highFeePolicies.length === 0) return null;

    const worst = highFeePolicies.sort((a, b) => b.feePercent - a.feePercent)[0];
    const totalAffectedSavings = highFeePolicies.reduce((s, p) => s + p.savings, 0);

    return {
      ruleId: this.id,
      category: this.category,
      title: "דמי ניהול גבוהים מהצבירה",
      summary: `${worst.feePercent}% דמי ניהול על ₪${Math.round(totalAffectedSavings).toLocaleString("he-IL")} — אפשר לחסוך`,
      explanation: `נמצאו דמי ניהול של ${worst.feePercent}% מהצבירה בפוליסה ${worst.policyNumber} ב${worst.insurer}. בסכומים גבוהים, הפחתת דמי ניהול יכולה לחסוך אלפי שקלים בשנה.`,
      whyNow: "דמי ניהול גבוהים שוחקים את החיסכון מדי חודש",
      urgencyLevel: worst.feePercent > 1.5 ? 2 : 1,
      branch: "LIFE",
      evidence: { highFeePolicies, totalAffectedSavings },
      scoringHints: {
        financialImpact: Math.min(90, 50 + Math.round(totalAffectedSavings / 10000)),
        dataConfidence: 90,
        urgency: worst.feePercent > 1.5 ? 70 : 50,
        actionClarity: 85,
        customerFit: 80,
      },
    };
  },
};

// ============================================================
// Rule 17: Expiring policy
// ============================================================
const expiringPolicy: InsightRule = {
  id: "expiring-policy",
  name: "פוליסה מתחדשת בקרוב",
  category: "EXPIRING_POLICY",
  evaluate(profile: CustomerProfile): RuleResult | null {
    for (const p of profile.activePolicies) {
      const daysLeft = daysUntil(p.endDate);
      if (daysLeft != null && daysLeft > 0 && daysLeft <= 90) {
        return {
          ruleId: this.id,
          category: this.category,
          title: `פוליסה ${p.policyNumber} מתחדשת בעוד ${Math.round(daysLeft)} ימים`,
          summary: `פוליסת ${p.subType || p.productName || p.category} ב${p.insurer} מסתיימת בקרוב`,
          explanation: `הפוליסה מס' ${p.policyNumber} ב${p.insurer} מסתיימת בעוד ${Math.round(daysLeft)} ימים. זה הזמן לבדוק תנאי חידוש ולהשוות מחירים.`,
          whyNow: `${Math.round(daysLeft)} ימים עד תום תוקף`,
          urgencyLevel: daysLeft <= 30 ? 2 : 1,
          branch: p.category === "PROPERTY" ? "ELEMENTARY" : "LIFE",
          evidence: { policyNumber: p.policyNumber, endDate: p.endDate, daysLeft: Math.round(daysLeft), insurer: p.insurer },
          scoringHints: {
            financialImpact: 60,
            dataConfidence: 95,
            urgency: daysLeft <= 30 ? 90 : 65,
            actionClarity: 90,
            customerFit: 80,
          },
        };
      }
    }
    return null;
  },
};

// ============================================================
// Rule 18: Cross-file opportunity (customer in both life + elementary)
// ============================================================
const crossFileOpportunity: InsightRule = {
  id: "cross-file-opportunity",
  name: "לקוח רב-ענפי",
  category: "CROSS_SELL_OPPORTUNITY",
  evaluate(profile: CustomerProfile): RuleResult | null {
    if (!profile.hasLifeBranch || !profile.hasElementaryBranch) return null;

    const lifePolicies = profile.activePolicies.filter((p) => p.category !== "PROPERTY");
    const elemPolicies = profile.activePolicies.filter((p) => p.category === "PROPERTY");

    if (lifePolicies.length === 0 || elemPolicies.length === 0) return null;

    return {
      ruleId: this.id,
      category: this.category,
      title: "לקוח רב-ענפי — הזדמנות לשיחה מקיפה",
      summary: `${lifePolicies.length} פוליסות חיים + ${elemPolicies.length} פוליסות אלמנטרי — הזדמנות לסקירה כוללת`,
      explanation: "לקוח שמופיע בשני הענפים (חיים ואלמנטרי) הוא לקוח מרכזי. שיחה מקיפה יכולה לחשוף פערים ולחזק את הקשר.",
      whyNow: "הנתונים מראים שהלקוח כבר סומך עליכם — הזמן להעמיק",
      urgencyLevel: 0,
      branch: "LIFE",
      evidence: { lifePolicies: lifePolicies.length, elemPolicies: elemPolicies.length },
      scoringHints: { financialImpact: 55, dataConfidence: 95, urgency: 30, actionClarity: 60, customerFit: 80 },
    };
  },
};

// ============================================================
// Export all rules
// ============================================================

export const allRules: InsightRule[] = [
  newVehicleOriginalParts,
  mortgageProducts,
  mortgageRateCheck,
  travelInsuranceTiming,
  lifeInsurancePriceCheck,
  healthMedicationAppendix,
  accidentAuthorizedGarages,
  rentalPropertyCoverage,
  renovationInsurance,
  stockExposureReview,
  pensionStockComponent,
  bankSavingsOpportunity,
  retirementPlanning,
  noHealthCoverage,
  singleCategoryCustomer,
  highManagementFees,
  expiringPolicy,
  crossFileOpportunity,
];
