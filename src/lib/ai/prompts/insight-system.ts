export const INSIGHT_SYSTEM_PROMPT = `אתה יועץ ביטוח ישראלי מומחה, בעל ניסיון של 20 שנה בתחום.

תפקידך: לנתח תיק ביטוח של לקוח ולמצוא תובנות חכמות שיכולות לעזור ללקוח ולמשרד הביטוח.

## כללים חשובים:
1. כל תובנה חייבת להתבסס על נתונים ספציפיים מהתיק — אסור להמציא
2. כתוב בעברית טבעית ומקצועית
3. התובנות צריכות להיות פרקטיות ובנות-ביצוע
4. אל תחזור על תובנות שכבר זוהו (רשימת "תובנות קיימות" מצורפת)
5. חשוב על מה שסוכן ביטוח טוב היה שם לב אליו
6. התמקד בערך ללקוח — לא רק במכירה
7. התייחס לשני הענפים: חיים (חיים, בריאות, פנסיה, חיסכון) ואלמנטרי (רכב, דירה, עסק)

## סוגי תובנות שכדאי לחפש:
- פערי כיסוי שלא נבדקו
- מוצרים שכדאי לבדוק התאמה מחדש
- שינויי חיים שמצריכים עדכון (גיל, מצב משפחתי)
- הזדמנויות לחיסכון בפרמיה
- אופטימיזציה של מבנה ההשקעות
- מידע חשוב שהלקוח צריך לדעת
- שירותים שהלקוח לא מנצל

## פורמט הפלט:
החזר מערך של עד 3 תובנות. לכל תובנה:
- title: כותרת קצרה וחדה בעברית
- summary: משפט אחד שמסביר את התובנה
- explanation: הסבר מפורט עם הפניות לנתונים ספציפיים
- whyNow: למה דווקא עכשיו חשוב
- urgencyLevel: 0 (נמוך), 1 (בינוני), 2 (גבוה)
- estimatedFinancialImpact: low / medium / high
- evidence: אובייקט עם הנתונים שהובילו לתובנה`;

/**
 * Classify a premium value into a Hebrew range label for AI data minimization.
 */
function premiumRange(value: number): string {
  if (value < 100) return "פרמיה נמוכה";
  if (value < 500) return "פרמיה בינונית";
  return "פרמיה גבוהה";
}

/**
 * Convert a date string to policy age in years for AI data minimization.
 */
function policyAgeYears(dateStr: string | null): string {
  if (!dateStr) return "לא ידוע";
  const start = new Date(dateStr);
  const now = new Date();
  const years = Math.floor(
    (now.getTime() - start.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
  );
  if (years < 1) return "פחות משנה";
  return `${years} שנים`;
}

export function buildInsightUserPrompt(params: {
  customerName: string;
  age: number | null;
  maritalStatus: string | null;
  policies: Array<{
    category: string;
    subType: string | null;
    insurer: string;
    status: string;
    premiumMonthly: number | null;
    premiumAnnual: number | null;
    accumulatedSavings: number | null;
    startDate: string | null;
    endDate: string | null;
    vehicleYear: number | null;
    managementFees: Array<{ feeType: string; ratePercent: number | null }>;
  }>;
  existingInsights: string[];
}): string {
  const { age, maritalStatus, policies, existingInsights } = params;

  // AI data minimization: use "הלקוח" instead of actual name
  let prompt = `## פרופיל לקוח
שם: הלקוח
גיל: ${age || "לא ידוע"}
מצב משפחתי: ${maritalStatus || "לא ידוע"}

## פוליסות (${policies.length} סה"כ)
`;

  for (const p of policies) {
    prompt += `- ${p.category} | ${p.subType || ""} | ${p.insurer} | סטטוס: ${p.status}`;
    // Data minimization: premium ranges instead of exact values
    if (p.premiumMonthly) prompt += ` | ${premiumRange(p.premiumMonthly)}`;
    if (p.premiumAnnual) prompt += ` | ${premiumRange(p.premiumAnnual / 12)} (שנתית)`;
    if (p.accumulatedSavings) prompt += ` | חיסכון: ${p.accumulatedSavings > 100000 ? "מעל 100K" : "עד 100K"}`;
    // Data minimization: policy age in years instead of exact dates
    if (p.startDate) prompt += ` | ותק פוליסה: ${policyAgeYears(p.startDate)}`;
    if (p.vehicleYear) prompt += ` | שנת רכב: ${p.vehicleYear}`;
    if (p.managementFees.length > 0) {
      for (const fee of p.managementFees) {
        if (fee.ratePercent) prompt += ` | ${fee.feeType}: ${fee.ratePercent}%`;
      }
    }
    prompt += "\n";
  }

  if (existingInsights.length > 0) {
    prompt += `\n## תובנות קיימות (אל תחזור עליהן):\n`;
    for (const insight of existingInsights) {
      prompt += `- ${insight}\n`;
    }
  }

  prompt += `\nמצא עד 3 תובנות חדשות שלא נמצאות ברשימה הקיימת.`;

  return prompt;
}
