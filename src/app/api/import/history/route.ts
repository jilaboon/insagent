import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/auth";

export async function GET() {
  const { response: authResponse, role } = await requireAuth();
  if (authResponse) return authResponse;

  const roleResponse = requireRole(role, ["OWNER", "MANAGER", "OPERATIONS", "ADMIN"]);
  if (roleResponse) return roleResponse;
  const jobs = await prisma.importJob.findMany({
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

  // Every import gets its own row. Previously we deduped by fileName to
  // "hide replaced imports", but that broke the audit trail: re-uploading
  // the same file on a different date silently disappeared the earlier
  // entry. For an audit surface, honesty beats tidiness.
  return NextResponse.json(jobs);
}
