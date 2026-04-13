import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function GET() {
  const { response: authResponse } = await requireAuth();
  if (authResponse) return authResponse;
  const jobs = await prisma.importJob.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
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

  return NextResponse.json(jobs);
}
