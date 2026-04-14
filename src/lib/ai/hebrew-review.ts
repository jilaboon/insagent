/**
 * Shared Hebrew quality review.
 * Takes any Hebrew text, sends it through Sonnet for grammar/quality fix.
 * Used as a final pass on all AI-generated Hebrew content.
 *
 * DATA SAFETY: This module only receives AI-generated text (no customer PII).
 * It does NOT receive names, ת.ז., phone numbers, emails, or addresses.
 */

import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";

const HEBREW_EDITOR_PROMPT = `אתה עורך לשוני מקצועי לעברית. תפקידך לתקן טקסט בעברית.

כללים:
1. תקן שגיאות דקדוק — נטיות פעלים, זכר/נקבה, יחיד/רבים
2. תקן מילים שלא קיימות בעברית
3. תקן משפטים שנשמעים כמו תרגום מאנגלית — כתוב בעברית טבעית
4. תקן ביטויים לא תקניים כמו "לא נדיר ש...", "לא רגיל ש..."
5. אל תשנה את המשמעות, את האורך, או את הטון
6. אל תוסיף ואל תוריד מידע
7. אם הטקסט תקין — החזר אותו כמו שהוא
8. החזר רק את הטקסט המתוקן, ללא הסברים`;

/**
 * Review and fix Hebrew text using Sonnet.
 * Returns the original text if the review fails.
 */
export async function reviewHebrew(text: string): Promise<string> {
  if (!text || text.trim().length < 10) return text;

  try {
    const result = await generateText({
      model: anthropic("claude-sonnet-4-20250514"),
      system: HEBREW_EDITOR_PROMPT,
      prompt: `תקן את הטקסט הבא אם יש בו שגיאות עברית. אם הוא תקין, החזר אותו כמו שהוא.\n\n${text}`,
    });

    const fixed = result.text.trim();
    // Sanity check: if wildly different length, keep original
    if (fixed.length < text.length * 0.5 || fixed.length > text.length * 1.5) {
      return text;
    }
    return fixed;
  } catch {
    return text;
  }
}

/**
 * Review multiple Hebrew texts in one batch.
 * More efficient than calling reviewHebrew individually.
 */
export async function reviewHebrewBatch(texts: string[]): Promise<string[]> {
  if (texts.length === 0) return [];
  if (texts.length === 1) return [await reviewHebrew(texts[0])];

  const numbered = texts.map((t, i) => `[${i + 1}] ${t}`).join("\n---\n");

  try {
    const result = await generateText({
      model: anthropic("claude-sonnet-4-20250514"),
      system: HEBREW_EDITOR_PROMPT + "\n\nהטקסט מחולק למקטעים ממוספרים. החזר כל מקטע מתוקן עם המספר שלו בפורמט [X] טקסט.",
      prompt: `תקן את המקטעים הבאים:\n\n${numbered}`,
    });

    const fixed = result.text.trim();
    // Parse numbered sections back
    const sections = fixed.split(/\[(\d+)\]\s*/).filter(Boolean);
    const results: string[] = [...texts]; // default to originals

    for (let i = 0; i < sections.length - 1; i += 2) {
      const idx = parseInt(sections[i], 10) - 1;
      const content = sections[i + 1]?.replace(/^---\s*/, "").trim();
      if (idx >= 0 && idx < texts.length && content) {
        results[idx] = content;
      }
    }

    return results;
  } catch {
    return texts;
  }
}
