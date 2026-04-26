/**
 * One-shot retune: relaxes the "high management fees vs. savings"
 * rule so it fires on a wider but still meaningful population.
 *
 *   old:  management_fee > 1.5 AND savings > 300000
 *   new:  management_fee > 0.6 AND savings > 200000
 *
 * Re-runnable safely. The script is idempotent — running it twice
 * just re-applies the same values.
 *
 * Usage:  node --env-file=.env scripts/retune-management-fee-rule.mjs
 */

import "dotenv/config";
import pkg from "@prisma/client";
const { PrismaClient } = pkg;
const prisma = new PrismaClient();

const RULE_TITLE = "דמי ניהול גבוהים מהצבירה";
const NEW_TRIGGER_CONDITION = "management_fee > 0.6 AND savings > 200000";
const NEW_TRIGGER_HINT = "דמי ניהול מעל 0.6% + צבירה מעל ₪200K";

async function main() {
  const rule = await prisma.officeRule.findFirst({
    where: { title: RULE_TITLE },
    select: {
      id: true,
      title: true,
      triggerCondition: true,
      triggerHint: true,
    },
  });

  if (!rule) {
    console.error(`[fail] no rule found with title "${RULE_TITLE}"`);
    await prisma.$disconnect();
    process.exit(1);
  }

  const oldCondition = rule.triggerCondition;
  const oldHint = rule.triggerHint;

  await prisma.officeRule.update({
    where: { id: rule.id },
    data: {
      triggerCondition: NEW_TRIGGER_CONDITION,
      triggerHint: NEW_TRIGGER_HINT,
    },
  });

  console.log(`[ok] retuned rule`);
  console.log(`  id:                ${rule.id}`);
  console.log(`  title:             ${rule.title}`);
  console.log(`  old triggerCond:   ${oldCondition}`);
  console.log(`  new triggerCond:   ${NEW_TRIGGER_CONDITION}`);
  console.log(`  old triggerHint:   ${oldHint}`);
  console.log(`  new triggerHint:   ${NEW_TRIGGER_HINT}`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
