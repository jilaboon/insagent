/**
 * Zod validation schemas for API mutation endpoints.
 */

import { z } from "zod";
import { NextResponse } from "next/server";

// ============================================================
// Import Upload
// ============================================================

export const importUploadSchema = z.object({
  fileName: z.string().min(1, "שם הקובץ חובה"),
  headers: z.array(z.string()).min(1, "חסרות כותרות"),
  rows: z.array(z.record(z.string(), z.string())).min(1, "לא נמצאו שורות"),
  jobId: z.string().uuid().optional(),
});

// ============================================================
// Messages
// ============================================================

export const messageUpdateSchema = z.object({
  status: z.enum(["DRAFT", "APPROVED", "SENT", "SKIPPED"]).optional(),
  bodyText: z.string().min(1).optional(),
  feedbackFlag: z
    .enum(["bad_hebrew", "bad_content", "wrong_tone", "good"])
    .optional(),
  feedbackNote: z.string().max(500).optional(),
});

export const messageGenerateSchema = z
  .object({
    insightId: z.string().uuid().optional(),
    insightIds: z.array(z.string().uuid()).optional(),
    agentName: z.string().max(50).optional(),
    combined: z.boolean().optional(),
  })
  .refine((data) => data.insightId || data.insightIds, {
    message: "חסר insightId או insightIds",
  });

// ============================================================
// Rules
// ============================================================

const RULE_CATEGORIES = [
  "חידוש",
  "כיסוי",
  "חיסכון",
  "שירות",
  "כללי",
  "renewal",
  "coverage",
  "savings",
  "general",
  "service",
] as const;

export const ruleCreateSchema = z.object({
  title: z.string().min(1, "שם הכלל חובה").max(200),
  body: z.string().min(1, "תוכן הכלל חובה").max(2000),
  category: z.string().max(50).optional(),
  triggerCondition: z.string().max(500).optional(),
  triggerHint: z.string().max(500).optional(),
  source: z.enum(["MANUAL", "AI_DATA", "AI_KNOWLEDGE"]).optional(),
});

export const ruleUpdateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  body: z.string().min(1).max(2000).optional(),
  category: z.string().max(50).optional(),
  triggerCondition: z.string().max(500).nullable().optional(),
  triggerHint: z.string().max(500).nullable().optional(),
  isActive: z.boolean().optional(),
  source: z.enum(["MANUAL", "AI_DATA", "AI_KNOWLEDGE"]).optional(),
});

// ============================================================
// Knowledge
// ============================================================

export const knowledgeCreateSchema = z.object({
  title: z.string().min(1, "כותרת חובה").max(500),
  content: z.string().min(1, "תוכן חובה").max(50000),
  source: z.string().max(500).optional(),
});

// ============================================================
// Insights Generate
// ============================================================

export const insightsGenerateSchema = z.object({
  offset: z.number().int().min(0).optional().default(0),
  limit: z.number().int().min(1).max(500).optional().default(200),
});

// ============================================================
// Pattern Suggest
// ============================================================

export const patternSuggestSchema = z.object({
  patternTitle: z.string().min(1, "כותרת הדפוס חובה").max(200),
  patternDescription: z.string().min(1, "תיאור הדפוס חובה").max(2000),
  count: z.number().int().min(0).optional(),
});

// ============================================================
// Helper: validate request body and return 400 on failure
// ============================================================

export function validateBody<T>(
  schema: z.ZodType<T>,
  data: unknown
): { success: true; data: T } | { success: false; response: NextResponse } {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issues = (result.error as { issues?: Array<{ message: string }> }).issues;
    const firstError = issues?.[0]?.message || "נתונים לא תקינים";
    return {
      success: false,
      response: NextResponse.json(
        { error: firstError },
        { status: 400 }
      ),
    };
  }
  return { success: true, data: result.data };
}
