// One-shot seed for the InstitutionalProvider table.
// Idempotent: re-running keeps the existing rows in sync with this list.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PROVIDERS = [
  {
    providerCode: "512065202",
    providerName: 'מיטב גמל ופנסיה בע"מ',
    shortName: "מיטב",
    category: "PENSION",
  },
  {
    providerCode: "513173393",
    providerName: 'אלטשולר שחם גמל ופנסיה בע"מ',
    shortName: "אלטשולר שחם",
    category: "PENSION",
  },
  {
    providerCode: "520004078",
    providerName: 'הראל חברה לביטוח בע"מ',
    shortName: "הראל",
    category: "INSURANCE",
  },
  {
    providerCode: "520004896",
    providerName: 'מגדל חברה לבטוח בע"מ',
    shortName: "מגדל",
    category: "INSURANCE",
  },
  {
    providerCode: "520024647",
    providerName: 'כלל חברה לביטוח בע"מ',
    shortName: "כלל",
    category: "INSURANCE",
  },
];

async function main() {
  for (const p of PROVIDERS) {
    const existing = await prisma.institutionalProvider.findUnique({
      where: { providerCode: p.providerCode },
    });
    if (existing) {
      await prisma.institutionalProvider.update({
        where: { providerCode: p.providerCode },
        data: {
          providerName: p.providerName,
          shortName: p.shortName,
          category: p.category,
          isActive: true,
        },
      });
      console.log(`[update] ${p.providerCode} ${p.shortName}`);
    } else {
      await prisma.institutionalProvider.create({ data: p });
      console.log(`[create] ${p.providerCode} ${p.shortName}`);
    }
  }
  console.log("\nDone. Seeded", PROVIDERS.length, "providers.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
