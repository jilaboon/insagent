import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { validateBody, queueSettingsSchema } from "@/lib/validation";
import {
  getQueueSettings,
  updateQueueSettings,
} from "@/lib/queue/settings";

export async function GET() {
  const { response: authResponse } = await requireAuth();
  if (authResponse) return authResponse;

  const settings = await getQueueSettings();
  return NextResponse.json(settings);
}

export async function PUT(request: NextRequest) {
  const { response: authResponse, email, role } = await requireAuth();
  if (authResponse) return authResponse;

  const roleResponse = requireRole(role, ["OWNER", "MANAGER", "ADMIN"]);
  if (roleResponse) return roleResponse;

  const body = await request.json().catch(() => ({}));
  const validation = validateBody(queueSettingsSchema, body);
  if (!validation.success) return validation.response;

  const before = await getQueueSettings();
  const after = await updateQueueSettings(validation.data);

  await logAudit({
    actorEmail: email,
    action: "queue_settings_updated",
    entityType: "queue_settings",
    details: { before, after, patch: validation.data },
  });

  return NextResponse.json(after);
}
