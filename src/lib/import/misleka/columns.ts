/**
 * Tolerant field-finder utilities for parsed Misleka XML trees.
 *
 * The parser runs with `removeNSPrefix: true`, so namespace prefixes
 * (xsi, p2, p3, p4, ...) are stripped before this layer sees the tree.
 * That means an `xsi:nil="true"` empty element shows up as either:
 *   - `{ "@_nil": "true" }`            (when only the attribute is present)
 *   - `{ "nil": "true" }`              (in older configurations)
 *   - `{ "TAG": { "@_nil": "true" } }` (the typical case after removal)
 *
 * In all cases the underlying value is treated as null.
 *
 * The functions in this file are deliberately defensive — Misleka XML
 * has many providers and many edge cases; throwing on unexpected shapes
 * would abort whole-file imports for cosmetic problems.
 */

// Type guards ----------------------------------------------------

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

/**
 * Check whether a node represents an `xsi:nil="true"` empty element.
 * After removeNSPrefix this manifests as a `nil` or `@_nil` property of
 * "true" (string) or `true` (boolean).
 */
function isNilNode(node: unknown): boolean {
  if (!isPlainObject(node)) return false;
  const direct = node["nil"];
  if (direct === "true" || direct === true) return true;
  const attr = node["@_nil"];
  if (attr === "true" || attr === true) return true;
  return false;
}

// cleanText ------------------------------------------------------

/**
 * Trim and return null for empty / whitespace-only / the literal
 * "NULLNULL" sentinel some providers emit.
 *
 * Right-padded plan names from KGM files arrive with trailing spaces;
 * trim handles those. Internal double spaces are preserved (e.g. street
 * names) — only edge whitespace is removed.
 */
export function cleanText(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  let s: string;
  if (typeof raw === "string") {
    s = raw;
  } else if (typeof raw === "number" || typeof raw === "boolean") {
    s = String(raw);
  } else {
    return null;
  }
  s = s.trim();
  if (s.length === 0) return null;
  if (s === "NULLNULL") return null;
  return s;
}

// Field reader ---------------------------------------------------

/**
 * Extract the textual value of a single tag from the parsed tree.
 *
 * fast-xml-parser surfaces a tag's text content as either:
 *   - a primitive (string / number) when the tag has no attributes
 *   - `{ "#text": "value" }` when the tag has attributes
 *   - `{ "@_nil": "true" }` for nil markers (no #text)
 *   - the empty string for `<TAG/>` self-closing
 *
 * `parseAttributeValue: false` and `trimValues: true` are assumed.
 */
function valueOfNode(node: unknown): string | null {
  if (node === null || node === undefined) return null;
  if (typeof node === "string") return cleanText(node);
  if (typeof node === "number" || typeof node === "boolean") {
    return cleanText(String(node));
  }
  if (Array.isArray(node)) {
    for (const entry of node) {
      const v = valueOfNode(entry);
      if (v !== null) return v;
    }
    return null;
  }
  if (isPlainObject(node)) {
    if (isNilNode(node)) return null;
    if (Object.prototype.hasOwnProperty.call(node, "#text")) {
      return cleanText(node["#text"]);
    }
    return null;
  }
  return null;
}

/**
 * Find a single field by tag name (single string) or tag path (array).
 *
 * - Single string: descends into immediate children of `node` looking for
 *   the named tag. Returns the cleaned string, or null.
 * - Array path: walks each segment in turn. Each intermediate segment must
 *   resolve to an object (not an array); if an intermediate segment IS an
 *   array, the first entry is used. The final segment may be any leaf
 *   shape supported by `valueOfNode`.
 *
 * If any segment is missing, returns null.
 */
export function findField(
  node: unknown,
  tagPath: string | string[],
): string | null {
  if (!isPlainObject(node)) return null;
  const path = Array.isArray(tagPath) ? tagPath : [tagPath];
  let current: unknown = node;
  for (let i = 0; i < path.length; i++) {
    if (!isPlainObject(current)) return null;
    const segment = path[i];
    const next = current[segment];
    if (next === undefined) return null;
    if (i === path.length - 1) {
      return valueOfNode(next);
    }
    if (Array.isArray(next)) {
      current = next.length > 0 ? next[0] : undefined;
    } else {
      current = next;
    }
  }
  return null;
}

/**
 * Return all matching child nodes for a given tag name.
 *
 * fast-xml-parser may render a repeated tag as either an array OR a single
 * object depending on how many times it appears. This helper normalizes
 * both shapes to an array of nodes (always plain objects when present).
 *
 * Empty / missing → `[]`. Single object → `[obj]`. Array → as-is.
 * Nil markers are filtered out — a nil-only entry is treated as absent.
 */
export function findAllNodes(
  node: unknown,
  tagName: string,
): Array<Record<string, unknown>> {
  if (!isPlainObject(node)) return [];
  const value = node[tagName];
  if (value === undefined || value === null) return [];
  const list = Array.isArray(value) ? value : [value];
  const result: Array<Record<string, unknown>> = [];
  for (const entry of list) {
    if (isPlainObject(entry) && !isNilNode(entry)) {
      result.push(entry);
    }
  }
  return result;
}

// Date parsing ---------------------------------------------------

/**
 * Parse a Misleka date string into a Date.
 *
 * Supported shapes:
 *   - YYYYMMDD            (e.g. "19590709")
 *   - YYYYMMDDHHmmss      (e.g. "20260423092637")
 *   - YYYY-MM-DD          (e.g. "2030-08-19")
 *   - YYYYMM              (returns first day of month)
 *
 * Returns null on any unrecognized shape. All Date values are UTC.
 */
export function parseMislekaDate(raw: unknown): Date | null {
  const s = cleanText(raw);
  if (s === null) return null;

  const dashed = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (dashed) {
    const [, y, m, d] = dashed;
    return safeUtcDate(+y, +m, +d, 0, 0, 0);
  }

  if (/^\d{14}$/.test(s)) {
    const y = +s.slice(0, 4);
    const m = +s.slice(4, 6);
    const d = +s.slice(6, 8);
    const hh = +s.slice(8, 10);
    const mm = +s.slice(10, 12);
    const ss = +s.slice(12, 14);
    return safeUtcDate(y, m, d, hh, mm, ss);
  }

  if (/^\d{8}$/.test(s)) {
    const y = +s.slice(0, 4);
    const m = +s.slice(4, 6);
    const d = +s.slice(6, 8);
    return safeUtcDate(y, m, d, 0, 0, 0);
  }

  if (/^\d{6}$/.test(s)) {
    const y = +s.slice(0, 4);
    const m = +s.slice(4, 6);
    return safeUtcDate(y, m, 1, 0, 0, 0);
  }

  return null;
}

function safeUtcDate(
  y: number,
  m: number,
  d: number,
  hh: number,
  mm: number,
  ss: number,
): Date | null {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) {
    return null;
  }
  if (y < 1900 || y > 2200) return null;
  if (m < 1 || m > 12) return null;
  if (d < 1 || d > 31) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59 || ss < 0 || ss > 59) return null;
  const ts = Date.UTC(y, m - 1, d, hh, mm, ss);
  if (Number.isNaN(ts)) return null;
  const date = new Date(ts);
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== d
  ) {
    return null;
  }
  return date;
}

// Number parsing -------------------------------------------------

/**
 * Parse a Misleka numeric string. Strips commas (thousands separator) and
 * leading/trailing whitespace. Accepts decimals with `.` separator.
 * Returns null for non-numeric values.
 */
export function parseMislekaNumber(raw: unknown): number | null {
  const s = cleanText(raw);
  if (s === null) return null;
  const stripped = s.replace(/,/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(stripped)) return null;
  const n = Number(stripped);
  if (!Number.isFinite(n)) return null;
  return n;
}

// Israeli ID normalization --------------------------------------

/**
 * Normalize an Israeli national ID to the canonical 9-digit form.
 *
 * - Strips all non-digit characters
 * - Trims leading zeros beyond 9 digits (sample files include 16-digit
 *   left-padded forms like "0000000055664098" — must collapse to
 *   "055664098")
 * - Pads short forms with leading zeros to reach 9 digits
 *
 * Returns null when the input has no digits or is all zeros.
 *
 * This never validates a check digit — that is a higher-layer concern.
 */
export function normalizeIsraeliId(raw: unknown): string | null {
  const s = cleanText(raw);
  if (s === null) return null;
  let digits = s.replace(/\D/g, "");
  if (digits.length === 0) return null;
  if (digits.length > 9) {
    digits = digits.replace(/^0+/, "");
    if (digits.length === 0) {
      return null;
    }
    // If after trimming we still have more than 9 digits, the ID is
    // almost certainly junk; keep it as-is rather than truncating
    // arbitrary digits, but pad to at least 9 for downstream consistency.
    if (digits.length > 9) {
      return digits;
    }
  }
  return digits.padStart(9, "0");
}

// Phone normalization -------------------------------------------

/**
 * Normalize a phone-number-ish field. Specifically:
 *   - "NULLNULL" sentinel → null
 *   - empty / whitespace-only → null
 *   - everything else → cleaned text (trim only; no digit extraction —
 *     formatting like "050-5350281" is preserved for display fidelity)
 */
export function normalizePhone(raw: unknown): string | null {
  return cleanText(raw);
}
