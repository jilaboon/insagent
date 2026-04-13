export const TIP_SUGGESTION_SYSTEM_PROMPT = `אתה יועץ ביטוח ישראלי מומחה עם ניסיון של 20 שנה בניהול משרד סוכנות ביטוח.

## תפקידך:
אתה רואה נתונים מצרפיים (אגרגטיביים) מתיק הלקוחות של המשרד — לא נתוני לקוח בודד.
על בסיס הדפוסים שאתה מזהה בנתונים, הצע טיפים חדשים שכדאי למשרד להוסיף לספריית הטיפים שלו.

## מה זה "טיפ"?
טיפ הוא כלל אצבע או תובנה מקצועית שהסוכן יכול להשתמש בה בעבודה היומיומית.
לדוגמה: "לקוח מעל 60 ללא ביטוח סיעודי — חובה לפנות אליו", או "לקוח עם רק פוליסה אחת — הזדמנות להרחבה".

## הנחיות:
1. הצע 3-5 טיפים חדשים בלבד
2. כל טיפ חייב להתבסס על דפוס שמופיע בנתונים המצרפיים
3. אל תחזור על טיפים שכבר קיימים בספרייה (רשימת טיפים קיימים מצורפת)
4. כתוב בעברית טבעית, בטון מקצועי של משרד ביטוח
5. כל טיפ צריך להיות פרקטי — משהו שהסוכן יכול לעשות מחר בבוקר
6. הצע ערך ללקוח, לא רק מכירה
7. כל טיפ צריך להסביר למה הדפוס הזה מעניין ומה הסיכוי/הזדמנות

## קטגוריות:
- חידוש — טיפים הקשורים לחידוש פוליסות, מעקב תוקף, תזמון
- כיסוי — טיפים על פערי כיסוי, ביטוחים חסרים, הרחבות
- חיסכון — טיפים על חיסכון בפרמיות, אופטימיזציה, השוואות
- שירות — טיפים על שירות לקוחות, תקשורת, מעקב
- כללי — טיפים כלליים לניהול תיק

## פורמט:
לכל טיפ החזר:
- title: כותרת קצרה וחדה (עד 60 תווים)
- body: תוכן הטיפ — 2-3 משפטים מעשיים
- category: אחת מהקטגוריות למעלה
- triggerHint: מתי להשתמש בטיפ (לדוגמה: "לקוח עם פוליסה אחת בלבד")
- reasoning: הסבר קצר — איזה דפוס בנתונים הוביל להצעה הזו`;

export function buildTipSuggestionUserPrompt(params: {
  aggregateData: {
    totalCustomers: number;
    ageBrackets: Record<string, number>;
    categoryDistribution: Record<string, number>;
    singleCategoryCustomers: number;
    multiCategoryCustomers: number;
    avgPoliciesPerCustomer: number;
    highSavingsCustomers: number;
    expiringIn90Days: number;
    topInsurers: Array<{ insurer: string; count: number }>;
    noHealthInsurance: number;
    lifeBranchOnly: number;
    elementaryBranchOnly: number;
    bothBranches: number;
    policyAgeDistribution: Record<string, number>;
  };
  existingTips: Array<{ title: string; body: string; category: string | null }>;
}): string {
  const { aggregateData, existingTips } = params;

  let prompt = `## נתונים מצרפיים מתיק הלקוחות

### כללי
- סה"כ לקוחות: ${aggregateData.totalCustomers}
- ממוצע פוליסות ללקוח: ${aggregateData.avgPoliciesPerCustomer.toFixed(1)}

### התפלגות גילאים
`;

  for (const [bracket, count] of Object.entries(aggregateData.ageBrackets)) {
    prompt += `- ${bracket}: ${count} לקוחות\n`;
  }

  prompt += `\n### התפלגות קטגוריות פוליסות\n`;
  for (const [category, count] of Object.entries(aggregateData.categoryDistribution)) {
    prompt += `- ${category}: ${count} פוליסות\n`;
  }

  prompt += `\n### גיוון תיק
- לקוחות עם קטגוריה אחת בלבד: ${aggregateData.singleCategoryCustomers}
- לקוחות עם מספר קטגוריות: ${aggregateData.multiCategoryCustomers}

### חיסכון וסיכון
- לקוחות עם חיסכון מעל 100K: ${aggregateData.highSavingsCustomers}
- פוליסות שפג תוקפן ב-90 הימים הקרובים: ${aggregateData.expiringIn90Days}
- לקוחות ללא ביטוח בריאות: ${aggregateData.noHealthInsurance}

### ענפים
- רק ענף חיים (חיים/בריאות/פנסיה/חיסכון): ${aggregateData.lifeBranchOnly}
- רק ענף אלמנטרי (רכוש): ${aggregateData.elementaryBranchOnly}
- שני הענפים: ${aggregateData.bothBranches}

### מבטחים מובילים
`;
  for (const { insurer, count } of aggregateData.topInsurers.slice(0, 10)) {
    prompt += `- ${insurer}: ${count} פוליסות\n`;
  }

  prompt += `\n### גיל פוליסות\n`;
  for (const [ageRange, count] of Object.entries(aggregateData.policyAgeDistribution)) {
    prompt += `- ${ageRange}: ${count} פוליסות\n`;
  }

  if (existingTips.length > 0) {
    prompt += `\n## טיפים קיימים בספרייה (אל תחזור עליהם):\n`;
    for (const tip of existingTips) {
      prompt += `- [${tip.category || "כללי"}] ${tip.title}: ${tip.body}\n`;
    }
  }

  prompt += `\nהצע 3-5 טיפים חדשים שלא קיימים בספרייה, על בסיס הדפוסים בנתונים.`;

  return prompt;
}
