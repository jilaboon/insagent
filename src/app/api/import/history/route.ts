import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/auth";

export async function GET() {
  const { response: authResponse, role } = await requireAuth();
  if (authResponse) return authResponse;

  const roleResponse = requireRole(role, ["OWNER", "MANAGER", "OPERATIONS", "ADMIN"]);
  if (roleResponse) return roleResponse;
  const allJobs = await prisma.importJob.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      fileName: true,
      fileType: true,
      status: true,
      totalRows: true,
      importedRows: true,
      failedRows: true,
      newCustomers: true,
      updatedCustomers: true,
      createdAt: true,
      completedAt: true,
    },
  });

  // Keep only the latest row per (fileName, fileType). Simpler to scan
  // in day-to-day use — you see the current state of each file. The full
  // audit trail still lives in import_jobs and can be surfaced later via
  // a dedicated audit view if needed.
  const seen = new Set<string>();
  const latest: typeof allJobs = [];
  for (const job of allJobs) {
    const key = `${job.fileName}::${job.fileType}`;
    if (seen.has(key)) continue;
    seen.add(key);
    latest.push(job);
  }

  return NextResponse.json(latest);
}
