import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { validateBody, queueRebuildSchema } from "@/lib/validation";
import { buildQueue } from "@/lib/queue/generator";
import { prisma } from "@/lib/db";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const { response: authResponse, email, role } = await requireAuth();
  if (authResponse) return authResponse;

  const roleResponse = requireRole(role, ["OWNER", "MANAGER", "ADMIN"]);
  if (roleResponse) return roleResponse;

  const rl = checkRateLimit(rateLimitKey("queue-rebuild", email), {
    maxRequests: 5,
    windowMs: 60_000,
  });
  if (rl.limited) {
    return NextResponse.json(
      { error: "נסה שוב בעוד רגע" },
      {
        status: 429,
        headers: rl.retryAfterMs
          ? { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) }
          : undefined,
      }
    );
  }

  const body = await request.json().catch(() => ({}));
  const validation = validateBody(queueRebuildSchema, body);
  if (!validation.success) return validation.response;

  const { reason, assignedUserId } = validation.data;

  // If a specific assignee is requested, make sure that user exists.
  if (assignedUserId) {
    const exists = await prisma.user.findUnique({
      where: { id: assignedUserId },
      select: { id: true },
    });
    if (!exists) {
      return NextResponse.json(
        { error: "משתמש לא נמצא" },
        { status: 404 }
      );
    }
  }

  try {
    const result = await buildQueue({
      reason: reason ?? "MANUAL_REFRESH",
      assignedUserId,
    });

    await logAudit({
      actorEmail: email,
      action: "queue_rebuilt",
      entityType: "queue",
      details: {
        reason: reason ?? "MANUAL_REFRESH",
        assignedUserId: assignedUserId ?? null,
        today: result.today,
        soon: result.soon,
      },
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error("Queue rebuild failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "שגיאה בבניית התור" },
      { status: 500 }
    );
  }
}
