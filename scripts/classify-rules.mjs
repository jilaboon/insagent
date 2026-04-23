/**
 * Stage A — one-shot classification of the 20 active rules as
 * commercial vs service_tip, tightening of over-broad service-tip
 * triggers, retiring the duplicate "מחיר ביטוח חיים" rule, and
 * adding the new "expiring external policy" commercial rule
 * (the "golden window" Rafi identified).
 *
 * Usage:  node --env-file=.env scripts/classify-rules.mjs
 *
 * Idempotent: safe to re-run.
 */

import "dotenv/config";
import pkg from "@prisma/client";
const { PrismaClient } = pkg;
const prisma = new PrismaClient();

// ---------------------------------------------------------------
// Classification — titles Rafi and I walked through together.
// ---------------------------------------------------------------

const COMMERCIAL_TITLES = [
  "דמי ניהול גבוהים מהצבירה",
  "ביטוח חיים — לא בדקת מחיר 3 שנים?",
  "מחיר ביטוח חיים",
  "רכיב מניות בפנסיה",
  "חיסכון גבוה ללא ביטוח חיים — חשיפה למשפחה",
  "לקוח עם חיסכון משמעותי שלא נסקר בתקופה ארוכה",
  "רכב חדש — חלקים מקוריים",
  "דירה מושכרת",
  "לקוח רב-ענפי — הזדמנות לשיחה מקיפה",
  "לקוח עם ענף ביטוח בודד",
  "משכנתאות מחברות ביטוח",
  "תכנון פרישה",
  "בדיקת ריבית משכנתא",
  "פוליסה מתחדשת בקרוב",
];

const SERVICE_TITLES = [
  'ביטוח נסיעות לחו"ל',
  "שיפוץ הבית",
  "תאונה — מוסכי הסדר בלבד",
  "נספח תרופות בביטוח רפואי",
  "כסף בבנק",
  "חשיפה למניות",
];

// ---------------------------------------------------------------
// Tightened triggers for the service tips that were firing on
// basically every customer. Anchored to title so we don't have to
// depend on rule IDs that may differ between environments.
// ---------------------------------------------------------------

const TIGHTENED_TRIGGERS = [
  {
    title: 'ביטוח נסיעות לחו"ל',
    triggerCondition:
      "age >= 25 AND age <= 55 AND savings > 50000 AND travel_season",
  },
  {
    title: "שיפוץ הבית",
    triggerCondition:
      "policy_category = PROPERTY AND policy_subtype = דירה AND policy_age_years > 7",
  },
  {
    title: "תאונה — מוסכי הסדר בלבד",
    triggerCondition:
      "policy_category = PROPERTY AND policy_subtype = רכב AND policy_age_years > 2",
  },
  {
    title: "כסף בבנק",
    triggerCondition:
      "savings > 100000 AND no_policy_category = SAVINGS AND no_policy_category = PENSION",
  },
  {
    title: "נספח תרופות בביטוח רפואי",
    triggerCondition:
      "policy_category = HEALTH AND policy_age_years > 5 AND age >= 50",
  },
];

// ---------------------------------------------------------------
// New rule: expiring external (Har HaBituach) policy within 90d.
// ---------------------------------------------------------------

const NEW_EXTERNAL_EXPIRING_RULE = {
  title: "פוליסה חיצונית מתחדשת בקרוב — חלון זהב",
  body: "זוהתה פוליסה של הלקוח במקור חיצוני (הר הביטוח) שמתחדשת בתוך 90 הימים הקרובים. זה החלון הקריטי להציע ריכוז/העברה למשרד לפני שהלקוח מחדש בחברה אחרת.",
  category: "חיסכון",
  kind: "commercial",
  triggerCondition: "external_policy_expiring_within_days < 90",
  triggerHint: "פוליסה חיצונית מסתיימת תוך 90 יום",
};

// ---------------------------------------------------------------
// "חשיפה למניות" rewrite — we have zero InvestmentTrack rows in
// production, so the old rule misfires. Turn it into an honest
// portfolio-review service tip.
// ---------------------------------------------------------------

const STOCKS_REWRITE = {
  title: "חשיפה למניות",
  body: "ללקוח חיסכון משמעותי שלא נסקר תקופה ארוכה. הזדמנות לעבור יחד על מסלול ההשקעה — לבדוק אם התאמת הסיכון, שינויים במצב אישי, או תשואות אחרונות דורשות התאמה.",
  category: "שירות",
  kind: "service_tip",
  triggerCondition: "savings > 200000 AND months_since_review > 18",
};

// ---------------------------------------------------------------
// Duplicate to retire. Rafi confirmed the NEW rule
// "ביטוח חיים — לא בדקת מחיר 3 שנים?" (with premium_monthly floor)
// is the survivor. Older "מחיר ביטוח חיים" rules get deactivated —
// not deleted — so history and analytics stay intact.
// ---------------------------------------------------------------

const OLD_LIFE_PRICE_TITLE = "מחיר ביטוח חיים";
const SURVIVOR_LIFE_PRICE_TITLE = "ביטוח חיים — לא בדקת מחיר 3 שנים?";

async function classifyExistingRules() {
  const all = await prisma.officeRule.findMany({
    select: { id: true, title: true, kind: true },
  });

  const titleToId = new Map(all.map((r) => [r.title, r.id]));

  let commercialCount = 0;
  let serviceCount = 0;
  let unknownCount = 0;

  for (const r of all) {
    let desired = null;
    if (COMMERCIAL_TITLES.includes(r.title)) desired = "commercial";
    else if (SERVICE_TITLES.includes(r.title)) desired = "service_tip";

    if (!desired) {
      console.log(`[skip]    unclassified: ${r.title}`);
      unknownCount += 1;
      continue;
    }

    if (r.kind === desired) {
      console.log(`[ok]      ${desired.padEnd(12)} ${r.title}`);
    } else {
      await prisma.officeRule.update({
        where: { id: r.id },
        data: { kind: desired },
      });
      console.log(
        `[kind]    ${r.kind} → ${desired.padEnd(12)} ${r.title}`
      );
    }

    if (desired === "commercial") commercialCount += 1;
    else serviceCount += 1;
  }

  return { titleToId, commercialCount, serviceCount, unknownCount };
}

async function tightenServiceTipTriggers() {
  for (const t of TIGHTENED_TRIGGERS) {
    const existing = await prisma.officeRule.findFirst({
      where: { title: t.title },
      select: { id: true, triggerCondition: true },
    });
    if (!existing) {
      console.log(`[miss]    tighten target not found: ${t.title}`);
      continue;
    }
    if (existing.triggerCondition === t.triggerCondition) {
      console.log(`[ok]      trigger already tight: ${t.title}`);
      continue;
    }
    await prisma.officeRule.update({
      where: { id: existing.id },
      data: { triggerCondition: t.triggerCondition },
    });
    console.log(
      `[tight]   ${t.title}\n          ${existing.triggerCondition}\n       →  ${t.triggerCondition}`
    );
  }
}

async function rewriteStocksExposure() {
  const existing = await prisma.officeRule.findFirst({
    where: { title: STOCKS_REWRITE.title },
    select: {
      id: true,
      triggerCondition: true,
      body: true,
      category: true,
      kind: true,
    },
  });
  if (!existing) {
    console.log(`[miss]    stocks-exposure rule not found, creating`);
    await prisma.officeRule.create({
      data: {
        title: STOCKS_REWRITE.title,
        body: STOCKS_REWRITE.body,
        category: STOCKS_REWRITE.category,
        kind: STOCKS_REWRITE.kind,
        triggerCondition: STOCKS_REWRITE.triggerCondition,
        triggerHint: "חיסכון >₪200K + לא נסקר 18+ חודשים",
        source: "MANUAL",
        isActive: true,
      },
    });
    return;
  }
  await prisma.officeRule.update({
    where: { id: existing.id },
    data: {
      body: STOCKS_REWRITE.body,
      category: STOCKS_REWRITE.category,
      kind: STOCKS_REWRITE.kind,
      triggerCondition: STOCKS_REWRITE.triggerCondition,
      triggerHint: "חיסכון >₪200K + לא נסקר 18+ חודשים",
      isActive: true,
    },
  });
  console.log(
    `[rewrite] ${STOCKS_REWRITE.title}\n          was: ${existing.triggerCondition}\n          now: ${STOCKS_REWRITE.triggerCondition}`
  );
}

async function deactivateDuplicateLifePriceRule() {
  // Survivor = the newer rule that has a premium_monthly floor.
  // Any rule that carries the old short title without the dash should
  // be deactivated. If somehow the "survivor" row doesn't exist yet
  // (fresh env), leave everything alone so we don't silently disable
  // the only life-insurance pricing rule.
  const survivor = await prisma.officeRule.findFirst({
    where: { title: SURVIVOR_LIFE_PRICE_TITLE },
    select: { id: true, isActive: true },
  });
  if (!survivor) {
    console.log(
      `[warn]    survivor "${SURVIVOR_LIFE_PRICE_TITLE}" missing — skipping deactivation`
    );
    return;
  }

  const olds = await prisma.officeRule.findMany({
    where: { title: OLD_LIFE_PRICE_TITLE },
    select: { id: true, isActive: true, triggerCondition: true },
  });
  for (const o of olds) {
    if (!o.isActive) {
      console.log(`[ok]      duplicate already inactive: ${OLD_LIFE_PRICE_TITLE}`);
      continue;
    }
    await prisma.officeRule.update({
      where: { id: o.id },
      data: { isActive: false },
    });
    console.log(
      `[retire]  ${OLD_LIFE_PRICE_TITLE} → isActive=false (trigger: ${o.triggerCondition})`
    );
  }
}

async function upsertExternalExpiringRule() {
  const existing = await prisma.officeRule.findFirst({
    where: { title: NEW_EXTERNAL_EXPIRING_RULE.title },
    select: { id: true },
  });
  if (existing) {
    await prisma.officeRule.update({
      where: { id: existing.id },
      data: {
        body: NEW_EXTERNAL_EXPIRING_RULE.body,
        category: NEW_EXTERNAL_EXPIRING_RULE.category,
        kind: NEW_EXTERNAL_EXPIRING_RULE.kind,
        triggerCondition: NEW_EXTERNAL_EXPIRING_RULE.triggerCondition,
        triggerHint: NEW_EXTERNAL_EXPIRING_RULE.triggerHint,
        isActive: true,
      },
    });
    console.log(`[updated] ${NEW_EXTERNAL_EXPIRING_RULE.title}`);
  } else {
    await prisma.officeRule.create({
      data: {
        title: NEW_EXTERNAL_EXPIRING_RULE.title,
        body: NEW_EXTERNAL_EXPIRING_RULE.body,
        category: NEW_EXTERNAL_EXPIRING_RULE.category,
        kind: NEW_EXTERNAL_EXPIRING_RULE.kind,
        triggerCondition: NEW_EXTERNAL_EXPIRING_RULE.triggerCondition,
        triggerHint: NEW_EXTERNAL_EXPIRING_RULE.triggerHint,
        source: "MANUAL",
        isActive: true,
      },
    });
    console.log(`[created] ${NEW_EXTERNAL_EXPIRING_RULE.title}`);
  }
}

async function main() {
  console.log("== Stage A — classify & tighten rules ==\n");

  const summary = await classifyExistingRules();
  console.log("");

  await tightenServiceTipTriggers();
  console.log("");

  await rewriteStocksExposure();
  console.log("");

  await deactivateDuplicateLifePriceRule();
  console.log("");

  await upsertExternalExpiringRule();
  console.log("");

  // Final summary
  const activeCount = await prisma.officeRule.count({
    where: { isActive: true },
  });
  const commercialActive = await prisma.officeRule.count({
    where: { isActive: true, kind: "commercial" },
  });
  const serviceActive = await prisma.officeRule.count({
    where: { isActive: true, kind: "service_tip" },
  });
  console.log("── totals ─────────────────────────────");
  console.log(`  active rules ........... ${activeCount}`);
  console.log(`    commercial ........... ${commercialActive}`);
  console.log(`    service_tip .......... ${serviceActive}`);
  console.log(`  unclassified seen ...... ${summary.unknownCount}`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
