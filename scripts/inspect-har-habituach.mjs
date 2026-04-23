import xlsx from "xlsx";
import path from "path";

const files = [
  "data/har-habituach/פוטנציאלים 2025-12-31 - 2025-01-01.xlsx",
  "data/har-habituach/פוטנציאלים 2026-04-20 - 2026-01-01.xlsx",
];

for (const f of files) {
  console.log("=".repeat(80));
  console.log("FILE:", path.basename(f));
  const wb = xlsx.readFile(f);

  const ws = wb.Sheets["פוטנציאלים"];
  const rows = xlsx.utils.sheet_to_json(ws, { defval: null });

  console.log("Total rows (excluding header):", rows.length);

  const ids = new Set(rows.map((r) => r["מספר זיהוי"]));
  console.log("Unique customer IDs:", ids.size);

  const branches = {};
  for (const r of rows) {
    const b = r["ענף ראשי"] || "—";
    branches[b] = (branches[b] || 0) + 1;
  }
  console.log("\nRows by ענף ראשי:");
  for (const [k, v] of Object.entries(branches).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${v.toString().padStart(4)}  ${k}`);
  }

  const insurers = {};
  for (const r of rows) {
    const c = r["חברה"] || "—";
    insurers[c] = (insurers[c] || 0) + 1;
  }
  console.log("\nTop חברה:");
  const sorted = Object.entries(insurers).sort((a, b) => b[1] - a[1]);
  for (const [k, v] of sorted.slice(0, 10)) {
    console.log(`  ${v.toString().padStart(4)}  ${k}`);
  }

  const plans = {};
  for (const r of rows) {
    const c = r["סיווג תוכנית"] || "—";
    plans[c] = (plans[c] || 0) + 1;
  }
  console.log("\nAll סיווג תוכנית:");
  for (const [k, v] of Object.entries(plans).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${v.toString().padStart(4)}  ${k}`);
  }

  const premTypes = {};
  for (const r of rows) {
    const c = r["סוג פרמיה"] || "—";
    premTypes[c] = (premTypes[c] || 0) + 1;
  }
  console.log("\nסוג פרמיה:");
  for (const [k, v] of Object.entries(premTypes)) {
    console.log(`  ${v.toString().padStart(4)}  ${k}`);
  }
}
