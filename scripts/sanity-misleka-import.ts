/**
 * Sanity test for the Misleka import pipeline.
 *
 * Reads the 8 Max Segal sample files, creates an ImportJob, runs
 * runMislekaImport end-to-end, and prints the report. Cleans up after
 * itself unless KEEP=1 is set in the environment.
 *
 * Usage:
 *   npx tsx scripts/sanity-misleka-import.ts
 *   KEEP=1 npx tsx scripts/sanity-misleka-import.ts    # leave rows in DB
 *
 * Reqs:
 *   - DATABASE_URL pointed at a local Supabase or dev Postgres
 *   - InstitutionalProvider table seeded
 *     (run scripts/seed-institutional-providers.mjs first)
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

import { runMislekaImport } from "@/lib/import/misleka/pipeline";
import type { MislekaImportReport } from "@/lib/import/misleka/types";

const SAMPLES_DIR = "/Users/gillavon/Desktop/mislaka-samples/max-segal";
const KEEP = process.env.KEEP === "1";

const prisma = new PrismaClient();

async function cleanup(importJobId: string) {
  await prisma.customerBalanceSnapshot.deleteMany({
    where: { importJobId },
  });
  await prisma.customerFinancialProduct.deleteMany({
    where: { importJobId },
  });
  await prisma.importJobCustomer.deleteMany({ where: { importJobId } });
  await prisma.importJob
    .delete({ where: { id: importJobId } })
    .catch(() => {});
  console.log(`cleaned up job ${importJobId}`);
}

async function runOnce(
  files: Array<{ fileName: string; buffer: Buffer }>,
  operatorId: string,
  operatorEmail: string,
  label: string,
): Promise<{ jobId: string; report: MislekaImportReport }> {
  const job = await prisma.importJob.create({
    data: {
      fileName: files[0]?.fileName ?? "misleka.xml",
      fileType: "misleka_xml",
      kind: "MISLEKA_XML",
      fileSize: 0,
      status: "PROCESSING",
      operatorId,
    },
    select: { id: true },
  });
  console.log(`[${label}] created ImportJob ${job.id}`);

  const report = await runMislekaImport({
    files,
    importJobId: job.id,
    operatorEmail,
    consent: {
      source: "DEMO_INTERNAL",
      scope: "DEMO_INTERNAL",
      date: new Date().toISOString(),
      recordedBy: operatorEmail,
      bypassConsent: true,
    },
  });

  return { jobId: job.id, report };
}

async function main() {
  // ---- Locate samples ---------------------------------------------------
  let sampleNames: string[];
  try {
    sampleNames = readdirSync(SAMPLES_DIR)
      .filter((n) => n.toLowerCase().endsWith(".xml"))
      .sort();
  } catch (err) {
    console.error(`Failed to read samples directory at ${SAMPLES_DIR}`);
    console.error(err);
    process.exit(1);
  }

  if (sampleNames.length === 0) {
    console.error(`No .xml files found in ${SAMPLES_DIR}`);
    process.exit(1);
  }

  console.log(`Found ${sampleNames.length} sample file(s) in ${SAMPLES_DIR}`);
  for (const f of sampleNames) console.log(`  - ${f}`);

  // ---- Resolve operator -------------------------------------------------
  const operatorEmail = "sanity-misleka@local.test";
  let operator = await prisma.user.findUnique({
    where: { email: operatorEmail },
  });
  if (!operator) {
    operator = await prisma.user.create({
      data: {
        email: operatorEmail,
        name: "Sanity Misleka Runner",
        role: "OWNER",
      },
    });
    console.log(`Created sanity user ${operatorEmail}`);
  }

  // ---- Sanity check: providers seeded -----------------------------------
  const providerCount = await prisma.institutionalProvider.count();
  if (providerCount === 0) {
    console.warn(
      "[warn] InstitutionalProvider table is empty — run scripts/seed-institutional-providers.mjs first.",
    );
  } else {
    console.log(`InstitutionalProvider rows: ${providerCount}`);
  }

  // ---- Read buffers -----------------------------------------------------
  const filesForPipeline = sampleNames.map((name) => ({
    fileName: name,
    buffer: readFileSync(join(SAMPLES_DIR, name)),
  }));

  // ---- First run --------------------------------------------------------
  console.log("\nRunning pipeline (first pass)...");
  const start1 = Date.now();
  let firstRun;
  try {
    firstRun = await runOnce(
      filesForPipeline,
      operator.id,
      operatorEmail,
      "first",
    );
  } catch (err) {
    console.error("Pipeline threw on first run:", err);
    await prisma.$disconnect();
    process.exit(1);
  }
  const elapsed1 = Date.now() - start1;
  const report = firstRun.report;

  console.log("\n========== Misleka import report ==========");
  console.log(`importJobId:              ${report.importJobId}`);
  console.log(`fileCount:                ${report.fileCount}`);
  console.log(`durationMs (pipeline):    ${report.durationMs}`);
  console.log(`durationMs (wall clock):  ${elapsed1}`);
  console.log(`matchedCustomers:         ${report.matchedCustomers}`);
  console.log(`newCustomers:             ${report.newCustomers}`);
  console.log(`manualReviewQueue:        ${report.manualReviewQueue.length}`);
  console.log(`productsCreated:          ${report.productsCreated}`);
  console.log(`productsUpdated:          ${report.productsUpdated}`);
  console.log(`balanceSnapshotsCreated:  ${report.balanceSnapshotsCreated}`);
  console.log(`warnings:                 ${report.warnings.length}`);
  console.log(`errors:                   ${report.errors.length}`);

  console.log("\n--- filesProcessed ---");
  for (const f of report.filesProcessed) {
    console.log(
      `  ${f.fileName} | provider=${f.providerCode} (${f.providerName}) | products=${f.productCount} warnings=${f.warningCount}`,
    );
  }

  if (report.warnings.length > 0) {
    console.log("\n--- first 10 warnings ---");
    for (const w of report.warnings.slice(0, 10)) {
      console.log(
        `  [${w.code}] ${w.message}${w.path ? ` @ ${w.path}` : ""}`,
      );
    }
  }

  if (report.errors.length > 0) {
    console.log("\n--- errors ---");
    for (const e of report.errors) {
      console.log(`  [${e.code}] ${e.message}`);
    }
  }

  if (report.manualReviewQueue.length > 0) {
    console.log("\n--- manualReviewQueue ---");
    for (const m of report.manualReviewQueue) {
      console.log(
        `  ${m.fileName} → ${m.candidateCustomerName} (${m.candidateCustomerId}) [${m.confidence}] ${m.reason}`,
      );
    }
  }

  // ---- Idempotency check -----------------------------------------------
  console.log("\nRunning pipeline (idempotency pass)...");
  const secondRun = await runOnce(
    filesForPipeline,
    operator.id,
    operatorEmail,
    "second",
  );
  const r2 = secondRun.report;
  console.log(
    `re-run: created=${r2.productsCreated} updated=${r2.productsUpdated} balances=${r2.balanceSnapshotsCreated}`,
  );
  if (r2.productsCreated !== 0) {
    console.error(
      "[fail] idempotency check failed — re-run created new product rows.",
    );
  } else {
    console.log("[ok] idempotency: re-run produced 0 new products");
  }

  // ---- Cleanup ----------------------------------------------------------
  if (!KEEP) {
    await cleanup(firstRun.jobId);
    await cleanup(secondRun.jobId);
  } else {
    console.log("\nKEEP=1 — leaving rows in place for inspection");
  }

  await prisma.$disconnect();
  console.log("\nDone.");
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
