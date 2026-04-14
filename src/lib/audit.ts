/**
 * Audit logging utility.
 * Writes structured audit entries to the AuditEntry table.
 */

import { prisma } from "@/lib/db";

interface AuditParams {
  actorEmail: string;
  action: string;
  entityType: string;
  entityId?: string;
  details?: object;
}

/**
 * Log an audit entry for a critical operation.
 * Failures are caught and logged to console — audit should never break the request.
 */
export async function logAudit(params: AuditParams): Promise<void> {
  try {
    // Look up actor by email to get ID (nullable FK)
    const actor = await prisma.user.findUnique({
      where: { email: params.actorEmail },
      select: { id: true },
    });

    await prisma.auditEntry.create({
      data: {
        actorId: actor?.id ?? null,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId ?? null,
        details: params.details ? (params.details as object) : undefined,
      },
    });
  } catch (error) {
    console.error("Audit log failed:", error);
  }
}
