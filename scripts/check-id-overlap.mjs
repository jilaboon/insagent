import "dotenv/config";
import xlsx from "xlsx";
import pkg from "@prisma/client";
const { PrismaClient } = pkg;

const files = [
  "data/har-habituach/פוטנציאלים 2025-12-31 - 2025-01-01.xlsx",
  "data/har-habituach/פוטנציאלים 2026-04-20 - 2026-01-01.xlsx",
];

const harIds = new Set();
for (const f of files) {
  const wb = xlsx.readFile(f);
  const rows = xlsx.utils.sheet_to_json(wb.Sheets["פוטנציאלים"], {
    defval: null,
  });
  for (const r of rows) {
    if (r["מספר זיהוי"]) harIds.add(String(r["מספר זיהוי"]).trim());
  }
}

console.log("Unique IDs in Har HaBituach files:", harIds.size);

const prisma = new PrismaClient();
const existing = await prisma.customer.findMany({
  select: { israeliId: true },
});
const officeIds = new Set(existing.map((c) => c.israeliId));

let match = 0;
let miss = 0;
for (const id of harIds) {
  if (officeIds.has(id)) match += 1;
  else miss += 1;
}

console.log("Customers in office DB:", officeIds.size);
console.log("Har HaBituach IDs that match an office customer:", match);
console.log("Har HaBituach IDs NOT in office DB:", miss);

await prisma.$disconnect();
