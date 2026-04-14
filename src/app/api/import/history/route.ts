import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function GET() {
  const { response: authResponse } = await requireAuth();
  if (authResponse) return authResponse;
  const allJobs = await prisma.importJob.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
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

  // Show only the latest job per file name
  const latestByFile = new Map<string, (typeof allJobs)[number]>();
  for (const job of allJobs) {
    if (!latestByFile.has(job.fileName)) {
      latestByFile.set(job.fileName, job);
    }
  }

  return NextResponse.json(Array.from(latestByFile.values()));
}
