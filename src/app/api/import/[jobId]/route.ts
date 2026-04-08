import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;

  const job = await prisma.importJob.findUnique({
    where: { id: jobId },
    include: {
      _count: {
        select: { customerLinks: true, policies: true },
      },
    },
  });

  if (!job) {
    return NextResponse.json({ error: "לא נמצא" }, { status: 404 });
  }

  return NextResponse.json({
    id: job.id,
    fileName: job.fileName,
    fileType: job.fileType,
    status: job.status,
    totalRows: job.totalRows,
    importedRows: job.importedRows,
    failedRows: job.failedRows,
    newCustomers: job.newCustomers,
    updatedCustomers: job.updatedCustomers,
    errorLog: job.errorLog,
    createdAt: job.createdAt.toISOString(),
    completedAt: job.completedAt?.toISOString() || null,
    customerCount: job._count.customerLinks,
    policyCount: job._count.policies,
  });
}
