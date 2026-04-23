import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

/**
 * GET /api/insights/staleness
 *
 * Tells the UI whether a fresh insight generation run is needed.
 * "Stale" = the most recent data change (import or rule edit) is newer
 * than the last full insight generation run.
 *
 * Response:
 *   {
 *     isStale: boolean,
 *     reasons: string[],              // ["import", "rule_change"]
 *     lastInsightGenerationAt: ISO | null,
 *     lastImportAt: ISO | null,
 *     lastImportFileName: string | null,
 *     lastImportSource: string | null, // "BAFI" | "הר הביטוח" | etc.
 *     lastRuleChangeAt: ISO | null,
 *   }
 */
export async function GET() {
  const { response: authResponse } = await requireAuth();
  if (authResponse) return authResponse;

  const [setting, lastImport, lastRuleChange] = await Promise.all([
    prisma.systemSetting.findUnique({
      where: { key: "lastInsightGenerationAt" },
      select: { value: true },
    }),
    prisma.importJob.findFirst({
      where: { status: { in: ["COMPLETED", "PARTIAL"] } },
      orderBy: { completedAt: "desc" },
      select: { completedAt: true, fileName: true, fileType: true },
    }),
    prisma.officeRule.findFirst({
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    }),
  ]);

  const lastInsightGenerationAt = setting
    ? new Date(setting.value)
    : null;
  const lastImportAt = lastImport?.completedAt ?? null;
  const lastRuleChangeAt = lastRuleChange?.updatedAt ?? null;

  const reasons: string[] = [];
  if (
    lastImportAt &&
    (!lastInsightGenerationAt || lastImportAt > lastInsightGenerationAt)
  ) {
    reasons.push("import");
  }
  if (
    lastRuleChangeAt &&
    (!lastInsightGenerationAt || lastRuleChangeAt > lastInsightGenerationAt)
  ) {
    reasons.push("rule_change");
  }

  const sourceLabel =
    lastImport?.fileType === "har_habituach"
      ? "הר הביטוח"
      : lastImport?.fileType === "life" ||
          lastImport?.fileType === "elementary" ||
          lastImport?.fileType?.startsWith("bafi")
        ? "BAFI"
        : lastImport?.fileType
          ? "אחר"
          : null;

  return NextResponse.json({
    isStale: reasons.length > 0,
    reasons,
    lastInsightGenerationAt: lastInsightGenerationAt?.toISOString() ?? null,
    lastImportAt: lastImportAt?.toISOString() ?? null,
    lastImportFileName: lastImport?.fileName ?? null,
    lastImportSource: sourceLabel,
    lastRuleChangeAt: lastRuleChangeAt?.toISOString() ?? null,
  });
}
