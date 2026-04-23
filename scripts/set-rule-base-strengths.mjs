/**
 * One-shot migration: assigns Rafi's per-rule baseStrength to every
 * existing OfficeRule. Re-runnable safely.
 *
 * Usage:  node --env-file=.env scripts/set-rule-base-strengths.mjs
 */

import "dotenv/config";
import pkg from "@prisma/client";
const { PrismaClient } = pkg;
const prisma = new PrismaClient();

// Base strengths per rule title. Fall back to 60 for anything not listed.
const STRENGTHS = {
  // Commercial — strongest
  "דמי ניהול גבוהים מהצבירה": 90,
  "חיסכון גבוה ללא ביטוח חיים — חשיפה למשפחה": 85,
  "פוליסה חיצונית מתחדשת בקרוב — חלון זהב": 85,
  "לקוח עם חיסכון משמעותי שלא נסקר בתקופה ארוכה": 80,
  "תכנון פרישה": 75,
  "בדיקת ריבית משכנתא": 70,
  "ביטוח חיים — לא בדקת מחיר 3 שנים?": 70,
  "רכיב מניות בפנסיה": 65,
  "לקוח רב-ענפי — הזדמנות לשיחה מקיפה": 65,
  "רכב חדש — חלקים מקוריים": 60,
  "לקוח עם ענף ביטוח בודד": 60,
  "שתי פוליסות דירה — לבדוק עם הלקוח": 55,
  "משכנתאות מחברות ביטוח": 55,
  // Renewal (split into its own lane)
  "פוליסה מתחדשת בקרוב": 50,
  // Deactivated duplicate — score doesn't matter
  "מחיר ביטוח חיים": 55,

  // Service tips
  "נספח תרופות בביטוח רפואי": 55,
  "תאונה — מוסכי הסדר בלבד": 50,
  "כסף בבנק": 50,
  "ביטוח נסיעות לחו\"ל": 45,
  "שיפוץ הבית": 45,
  "חשיפה למניות": 55,
};

async function main() {
  const rules = await prisma.officeRule.findMany({
    select: { id: true, title: true },
  });

  let updated = 0;
  let unmatched = [];

  for (const r of rules) {
    const strength = STRENGTHS[r.title];
    if (strength == null) {
      unmatched.push(r.title);
      continue;
    }
    await prisma.officeRule.update({
      where: { id: r.id },
      data: { baseStrength: strength },
    });
    console.log(`[ok] ${strength}  ${r.title}`);
    updated += 1;
  }

  console.log(`\nUpdated ${updated} rules.`);
  if (unmatched.length) {
    console.log(`Unmatched (kept at default 60):`);
    for (const t of unmatched) console.log("  - " + t);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
