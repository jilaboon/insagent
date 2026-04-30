/**
 * Customer matching for Misleka XML imports.
 *
 * Returns a CustomerMatchResult per the design doc §5.2:
 *
 *   HIGH    — normalized national ID exact match on Customer.israeliId.
 *   MEDIUM  — national ID match, but email or phone in the candidate differs
 *             from the existing record. We still link, but the report flags
 *             "contact data differs" so רפי can review.
 *   LOW     — no national ID match, but full name AND date-of-birth match
 *             an existing customer. Held for manual review (we DO NOT auto-link).
 *   NONE    — no match at all. Pipeline creates a new MISLEKA_ONLY customer.
 *
 * The matcher itself does not write to the DB and does not create the
 * "import report" line — it only returns the verdict + reason.
 *
 * National ID normalization: candidates already arrive normalized (parser is
 * authoritative). We still defensively normalize here to keep the matcher
 * usable in isolation (tests, ad-hoc tooling).
 */

import { prisma } from "@/lib/db";
import type {
  CustomerMatchResult,
  MislekaCustomerCandidate,
} from "./types";

/**
 * Strip non-digits and pad to 9 chars with leading zeros.
 * Returns null for empty / unusable input.
 */
export function normalizeIsraeliId(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 0) return null;
  return digits.padStart(9, "0");
}

/**
 * Best-effort full display name for matching. Prefers the parser-provided
 * fullName, falls back to firstName + lastName join. Returns null if neither
 * yields a usable string.
 */
function displayFullName(c: MislekaCustomerCandidate): string | null {
  if (c.fullName && c.fullName.trim().length > 0) return c.fullName.trim();
  const parts = [c.firstName, c.lastName].filter(
    (p): p is string => !!p && p.trim().length > 0,
  );
  if (parts.length === 0) return null;
  return parts.join(" ").trim();
}

/**
 * Compare two date-of-birth values for "same calendar day" equality. We
 * intentionally ignore time-of-day because parsed Misleka DOBs are dates,
 * but a Customer.dateOfBirth might be stored as a midnight timestamp in any
 * timezone.
 */
function sameDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

/**
 * Normalize an email for comparison: lowercase + trim. Empty string returns null.
 */
function normEmail(s: string | null | undefined): string | null {
  if (!s) return null;
  const v = s.trim().toLowerCase();
  return v.length === 0 ? null : v;
}

/**
 * Normalize a phone for comparison: strip everything except digits + leading
 * plus. Empty result returns null. We do NOT attempt full E.164 conversion;
 * digit-only equality is enough to flag "looks different" vs "looks same"
 * for the MEDIUM-vs-HIGH distinction.
 */
function normPhone(s: string | null | undefined): string | null {
  if (!s) return null;
  const digits = s.replace(/\D/g, "");
  return digits.length === 0 ? null : digits;
}

/**
 * Match a Misleka customer candidate against existing Customer rows.
 */
export async function matchCustomer(
  candidate: MislekaCustomerCandidate,
): Promise<CustomerMatchResult> {
  const id = normalizeIsraeliId(candidate.israeliId ?? candidate.rawIsraeliId);

  // ---------- HIGH / MEDIUM path: national ID match ----------
  if (id) {
    const existing = await prisma.customer.findUnique({
      where: { israeliId: id },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
      },
    });

    if (existing) {
      // Compare email / phone to detect MEDIUM (contact data differs).
      const candidateEmail = normEmail(candidate.email);
      const existingEmail = normEmail(existing.email);
      const emailDiffers =
        candidateEmail !== null &&
        existingEmail !== null &&
        candidateEmail !== existingEmail;

      const candidatePhone = normPhone(candidate.phone);
      const existingPhone = normPhone(existing.phone);
      const phoneDiffers =
        candidatePhone !== null &&
        existingPhone !== null &&
        candidatePhone !== existingPhone;

      if (emailDiffers || phoneDiffers) {
        return {
          confidence: "MEDIUM",
          customerId: existing.id,
          reason: "התאמה לפי תעודת זהות, פרטי קשר שונים מהרשומה במשרד",
        };
      }

      return {
        confidence: "HIGH",
        customerId: existing.id,
        reason: "התאמה מלאה לפי תעודת זהות",
      };
    }
  }

  // ---------- LOW path: no ID match, but name + DOB match an existing row ----------
  const fullName = displayFullName(candidate);
  if (fullName && candidate.dateOfBirth) {
    const candidateFirst = (candidate.firstName ?? "").trim();
    const candidateLast = (candidate.lastName ?? "").trim();

    // Pull a small candidate set: anyone with a DOB in the DB whose names
    // overlap. We avoid loading the whole table by filtering on whichever
    // name component we have.
    //
    // Note on case sensitivity: Hebrew text doesn't have case, so a
    // straight equality compare is fine. We still normalize whitespace.
    const where: Parameters<typeof prisma.customer.findMany>[0] = {
      where: {
        dateOfBirth: { not: null },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        dateOfBirth: true,
        israeliId: true,
      },
      take: 50,
    };

    if (candidateFirst && candidateLast) {
      where.where = {
        ...where.where,
        firstName: candidateFirst,
        lastName: candidateLast,
      };
    } else if (candidateLast) {
      where.where = { ...where.where, lastName: candidateLast };
    } else if (candidateFirst) {
      where.where = { ...where.where, firstName: candidateFirst };
    }

    const candidates = await prisma.customer.findMany(where);

    for (const row of candidates) {
      if (!row.dateOfBirth) continue;
      if (!sameDay(row.dateOfBirth, candidate.dateOfBirth)) continue;

      const rowFull = `${row.firstName ?? ""} ${row.lastName ?? ""}`
        .trim()
        .replace(/\s+/g, " ");
      const candFull = fullName.replace(/\s+/g, " ");

      if (rowFull === candFull) {
        return {
          confidence: "LOW",
          customerId: null,
          candidateCustomerId: row.id,
          candidateCustomerName: rowFull,
          reason: "אין תעודת זהות במסלקה, שם מלא ותאריך לידה תואמים לקוח קיים",
        };
      }
    }
  }

  // ---------- NONE: no match at all ----------
  return {
    confidence: "NONE",
    customerId: null,
    reason: "לא נמצאה התאמה",
  };
}
