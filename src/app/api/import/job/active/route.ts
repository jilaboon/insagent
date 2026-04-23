import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

/**
 * GET /api/import/job/active?fileType=har_habituach
 *
 * Returns the current operator's most relevant ImportJob for the given
 * fileType. "Relevant" = PROCESSING (in-flight) or completed within the
 * last 120 seconds (so the UI can pick up the final state even if the
 * user navigated away during the upload).
 *
 * Used by the Har HaBituach import UI to show a live progress bar and
 * to recover state after navigation.
 */
export async function GET(request: NextRequest) {
  const { response: authResponse, email } = await requireAuth();
  if (authResponse) return authResponse;

  const fileType =
    request.nextUrl.searchParams.get("fileType") || "har_habituach";

  const operator = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (!operator) {
    return NextResponse.json({ job: null });
  }

  const cutoff = new Date(Date.now() - 120 * 1000);

  const job = await prisma.importJob.findFirst({
    where: {
      operatorId: operator.id,
      fileType,
      OR: [
        { status: "PROCESSING" },
        { completedAt: { gte: cutoff } },
      ],
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      fileName: true,
      status: true,
      totalRows: true,
      importedRows: true,
      newCustomers: true,
      updatedCustomers: true,
      failedRows: true,
      createdAt: true,
      completedAt: true,
    },
  });

  return NextResponse.json({ job });
}
