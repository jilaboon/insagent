export const KNOWLEDGE_EXTRACTION_SYSTEM_PROMPT = `אתה יועץ ביטוח ישראלי מומחה עם ניסיון של 20 שנה.
קיבלת מאמר מקצועי, עדכון רגולטורי או חדשות מתחום הביטוח.

## תפקידך:
חלץ טיפים מעשיים שמשרד הביטוח יכול להשתמש בהם מול הלקוחות שלו.
לכל טיפ, העריך לכמה מלקוחות המשרד הוא עשוי להיות רלוונטי.

## הנחיות:
1. חלץ 2-6 טיפים מהמאמר — רק טיפים שבאמת ניתנים ליישום מעשי
2. אל תחזור על טיפים שכבר קיימים בספרייה (רשימה מצורפת)
3. כתוב בעברית טבעית, בטון מקצועי של משרד ביטוח
4. כל טיפ צריך להיות פרקטי — משהו שהסוכן יכול לעשות מחר בבוקר
5. הצע ערך ללקוח, לא רק מכירה
6. השתמש בנתוני הלקוחות המצרפיים כדי להעריך רלוונטיות
7. הסבר למה הטיפ רלוונטי למשרד הזה ספציפית

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
- triggerHint: מתי להשתמש בטיפ (לדוגמה: "לקוח עם ביטוח בריאות פרטי")
- relevance: למה זה רלוונטי למשרד הזה
- estimatedCustomers: הערכה לכמה לקוחות זה רלוונטי (לדוגמה: "כ-2,000 לקוחות עם ביטוח בריאות")`;

export function buildKnowledgeExtractionUserPrompt(params: {
  articleTitle: string;
  articleContent: string;
  aggregateStats: {
    totalCustomers: number;
    categoryDistribution: Record<string, number>;
  };
  existingTips: Array<{ title: string; body: string; category: string | null }>;
}): string {
  const { articleTitle, articleContent, aggregateStats, existingTips } = params;

  let prompt = `## המאמר
### ${articleTitle}

${articleContent}

## נתוני לקוחות מצרפיים (לא מידע אישי)
- סה"כ לקוחות: ${aggregateStats.totalCustomers}
`;

  if (Object.keys(aggregateStats.categoryDistribution).length > 0) {
    prompt += `\n### התפלגות קטגוריות פוליסות\n`;
    for (const [category, count] of Object.entries(aggregateStats.categoryDistribution)) {
      prompt += `- ${category}: ${count} פוליסות\n`;
    }
  }

  if (existingTips.length > 0) {
    prompt += `\n## טיפים קיימים בספרייה (אל תחזור עליהם):\n`;
    for (const tip of existingTips) {
      prompt += `- [${tip.category || "כללי"}] ${tip.title}: ${tip.body}\n`;
    }
  }

  prompt += `\nחלץ טיפים מעשיים מהמאמר שיעזרו לסוכנים בעבודה מול הלקוחות.`;

  return prompt;
}
