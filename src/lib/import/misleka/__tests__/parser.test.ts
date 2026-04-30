// Smoke test for the Misleka parser modules.
//
// Runs against the real 8-file Max Segal sample (Phase 1 acceptance bar):
//   - All 8 files parse without throwing
//   - Provider code is detected per file
//   - Customer national ID normalizes to a single value across all files
//   - At least one product is extracted from each file
//   - Balance snapshots are present in Altshuler files
//   - Unknown codes generate warnings, not crashes
//
// The script does not commit any test data; it only reads from the local
// sample directory. If the directory is missing, the script exits 0
// (skipped) so it does not break CI in environments without samples.
//
// Run with:
//   ./node_modules/.bin/tsx \
//     src/lib/import/misleka/__tests__/parser.test.ts

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { extractFromFile } from "../index.js";

const SAMPLE_DIR = "/Users/gillavon/Desktop/mislaka-samples/max-segal";
const EXPECTED_FILES = 8;
const EXPECTED_NATIONAL_ID = "055664098";

async function main(): Promise<number> {
  if (!existsSync(SAMPLE_DIR)) {
    console.error(`Sample directory not found at ${SAMPLE_DIR}`);
    console.error("Skipping smoke test.");
    return 0;
  }

  const files = readdirSync(SAMPLE_DIR)
    .filter((f) => f.endsWith(".xml"))
    .sort();
  if (files.length !== EXPECTED_FILES) {
    console.error(
      `Expected ${EXPECTED_FILES} XML samples, found ${files.length}`,
    );
    return 1;
  }

  let failures = 0;
  const idsSeen = new Set<string | null>();
  const providerCodesSeen = new Set<string>();

  console.log(`Running smoke test over ${files.length} sample files\n`);

  for (const fileName of files) {
    const filePath = join(SAMPLE_DIR, fileName);
    const buffer = readFileSync(filePath);
    let result;
    try {
      result = await extractFromFile(buffer, fileName);
    } catch (err) {
      const name =
        err && typeof err === "object" && "name" in err
          ? String((err as { name: unknown }).name)
          : "Error";
      console.error(`  FAIL ${fileName}: parser threw ${name}`);
      failures++;
      continue;
    }

    const m = result.metadata;
    const c = result.customer;
    const p = result.products;
    const allWarnings = [
      ...result.warnings,
      ...p.flatMap((prod) => prod.warnings),
    ];
    const totalBalances = p.reduce(
      (sum, prod) => sum + prod.balances.length,
      0,
    );

    console.log(`File: ${fileName}`);
    console.log(`  provider:    ${m.providerCode}  (${m.providerName})`);
    console.log(`  interface:   ${m.interfaceTypeLabel}`);
    console.log(`  productTypes:${JSON.stringify(m.productTypes)}`);
    console.log(`  customer ID: ${c.israeliId}`);
    console.log(`  products:    ${p.length}`);
    console.log(`  balances:    ${totalBalances}`);
    console.log(`  warnings:    ${allWarnings.length}`);

    if (!m.providerCode) {
      console.error(`  ASSERT FAIL: empty providerCode`);
      failures++;
    } else {
      providerCodesSeen.add(m.providerCode);
    }
    if (c.israeliId !== EXPECTED_NATIONAL_ID) {
      console.error(
        `  ASSERT FAIL: customer ID expected "${EXPECTED_NATIONAL_ID}" got "${c.israeliId}"`,
      );
      failures++;
    }
    idsSeen.add(c.israeliId);
    if (p.length === 0) {
      console.error(`  ASSERT FAIL: no products extracted`);
      failures++;
    }

    // Altshuler files (513173393) — both should carry meaningful balances.
    if (m.providerCode === "513173393" && totalBalances === 0) {
      console.error(
        `  ASSERT FAIL: Altshuler file produced no balance snapshots`,
      );
      failures++;
    }

    console.log();
  }

  console.log("Cross-file assertions");
  console.log(`  distinct customer IDs: ${idsSeen.size}`);
  console.log(`  distinct provider codes: ${providerCodesSeen.size}`);

  if (idsSeen.size !== 1) {
    console.error(
      `  ASSERT FAIL: expected exactly 1 customer ID across files, got ${idsSeen.size}`,
    );
    failures++;
  }
  if (providerCodesSeen.size !== 5) {
    console.error(
      `  ASSERT FAIL: expected 5 distinct providers, got ${providerCodesSeen.size}`,
    );
    failures++;
  }

  if (failures > 0) {
    console.error(`\n${failures} assertion(s) failed.`);
    return 1;
  }
  console.log("\nAll assertions passed.");
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error("Unexpected test failure:", err);
    process.exit(2);
  });
