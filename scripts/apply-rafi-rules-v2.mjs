/**
 * One-shot migration: upserts/updates the 4 rules Rafi asked for today.
 *
 * Usage:  node --env-file=.env scripts/apply-rafi-rules-v2.mjs
 *
 * Safe to re-run; uses upsert-by-title.
 */

import "dotenv/config";
import pkg from "@prisma/client";
const { PrismaClient } = pkg;
const prisma = new PrismaClient();

// -------------------------------------------------------------
// The four rules
// -------------------------------------------------------------
const rules = [
  {
    // Existing rule — update threshold from existing 1.5%/100K to 1.5%/300K
    title: "דמי ניהול גבוהים מהצבירה",
    body: "ללקוח דמי ניהול גבוהים על צבירה מהותית. שווה להציע סקירת פוליסה ולבחון מעבר למסלול זול יותר.",
    category: "חיסכון",
    triggerCondition: "management_fee > 1.5 AND savings > 300000",
    triggerHint: "דמי ניהול >1.5% + צבירה >₪300K",
  },
  {
    // Existing rule — add premium_monthly floor
    title: "ביטוח חיים — לא בדקת מחיר 3 שנים?",
    body: "ללקוח פוליסת ביטוח חיים מעל 3 שנים עם פרמיה משמעותית. שווה לבדוק מחיר — השוק משתנה כל שנה-שנתיים.",
    category: "חיסכון",
    triggerCondition:
      "policy_category = LIFE AND policy_age_years > 3 AND premium_monthly >= 100",
    triggerHint: "ביטוח חיים >3 שנים + פרמיה >₪100/חודש",
  },
  {
    // New rule — high savings + stale review
    title: "לקוח עם חיסכון משמעותי שלא נסקר בתקופה ארוכה",
    body: "ללקוח חיסכון מצטבר של ₪300K ומעלה שלא נסקר בשנה וחצי האחרונה. מסלול, דמי ניהול ותשואה — הכל יכול להשתנות. זמן לפגישת סקירת תיק.",
    category: "שירות",
    triggerCondition: "savings > 300000 AND months_since_review > 18",
    triggerHint: "חיסכון >₪300K + לא נסקר 18+ חודשים",
  },
  {
    // New rule — high savings + no life insurance
    title: "חיסכון גבוה ללא ביטוח חיים — חשיפה למשפחה",
    body: "ללקוח חיסכון משמעותי אבל אין לו ביטוח חיים פעיל. החיסכון צובר ערך אך אין הגנה למשפחה במקרה אבידה. שווה לפתוח שיחה על הגנה.",
    category: "כיסוי",
    triggerCondition: "savings > 300000 AND no_policy_category = LIFE",
    triggerHint: "חיסכון >₪300K + אין ביטוח חיים",
  },
];

async function main() {
  for (const r of rules) {
    const existing = await prisma.officeRule.findFirst({
      where: { title: r.title },
      select: { id: true, triggerCondition: true },
    });
    if (existing) {
      await prisma.officeRule.update({
        where: { id: existing.id },
        data: {
          body: r.body,
          category: r.category,
          triggerCondition: r.triggerCondition,
          triggerHint: r.triggerHint,
          isActive: true,
        },
      });
      console.log(
        `[updated] ${r.title}\n  triggerCondition: ${existing.triggerCondition} → ${r.triggerCondition}`
      );
    } else {
      await prisma.officeRule.create({
        data: {
          title: r.title,
          body: r.body,
          category: r.category,
          triggerCondition: r.triggerCondition,
          triggerHint: r.triggerHint,
          source: "MANUAL",
          isActive: true,
        },
      });
      console.log(`[created] ${r.title}`);
    }
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
