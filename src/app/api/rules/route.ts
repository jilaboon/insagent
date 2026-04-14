import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function GET() {
  const { response: authResponse } = await requireAuth();
  if (authResponse) return authResponse;

  const rules = await prisma.officeRule.findMany({
    orderBy: { createdAt: "desc" },
  });

  const activeCount = rules.filter((r) => r.isActive).length;

  return NextResponse.json({
    items: rules,
    total: rules.length,
    activeCount,
  });
}

export async function POST(request: NextRequest) {
  const { response: authResponse, email, role } = await requireAuth();
  if (authResponse) return authResponse;

  const roleResponse = requireRole(role, ["OWNER", "MANAGER", "ADMIN"]);
  if (roleResponse) return roleResponse;

  const body = await request.json();
  const { title, body: ruleBody, category, triggerCondition, triggerHint, source } = body;

  if (!title || !ruleBody) {
    return NextResponse.json(
      { error: "שם הכלל ותוכן הם שדות חובה" },
      { status: 400 }
    );
  }

  const rule = await prisma.officeRule.create({
    data: {
      title,
      body: ruleBody,
      category: category || null,
      triggerCondition: triggerCondition || null,
      triggerHint: triggerHint || null,
      source: source || "MANUAL",
      isActive: true,
    },
  });

  await logAudit({
    actorEmail: email,
    action: "rule_created",
    entityType: "rule",
    entityId: rule.id,
    details: { title: rule.title, category: rule.category },
  });

  return NextResponse.json(rule, { status: 201 });
}
