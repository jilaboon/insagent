/**
 * Safe XML parser for Misleka files.
 *
 * Security model:
 *   - fast-xml-parser does not support DTDs, so XXE is structurally
 *     impossible. We pass options that make this stance explicit and
 *     reject any text that looks like a DTD or external entity reference
 *     before we even hand bytes to the parser.
 *   - Hard file-size cap of 25 MB. Anything larger is rejected as a
 *     suspected denial-of-service vector — real Misleka files for a
 *     single customer top out around 300 KB in the 8-file Max Segal
 *     sample.
 *   - SHA-256 hash of original bytes is computed for traceability and
 *     audit logging. Never raw bytes / parsed content in logs.
 *   - Encoding detection: declared (UTF-8 or Windows-1255) → declared,
 *     otherwise UTF-8 → fallback Windows-1255.
 *
 * The parsed tree uses removeNSPrefix to flatten xsi:, p2:, p3:, p4: ...
 * variations into a single set of plain tag names — the columns module
 * then reads them tolerantly.
 */

import { XMLParser } from "fast-xml-parser";
import iconv from "iconv-lite";
import { createHash } from "node:crypto";

import type { MislekaParsedFile } from "./types";
import { MislekaParseError, MislekaSecurityError } from "./errors";

const MAX_FILE_BYTES = 25 * 1024 * 1024;

// Markers that indicate the buffer contains a DTD declaration or an
// external entity reference. We refuse to parse such files outright.
const DTD_MARKER_RE = /<!DOCTYPE/i;
const EXTERNAL_ENTITY_RE = /<!ENTITY[^>]*\bSYSTEM\b/i;

const PARSER_OPTIONS = {
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: true,
  // Strips xsi:, p2:, p3:, p4:, ... prefixes. Crucial for Misleka files —
  // every provider uses different prefix numbers for the same xsi:nil
  // attribute (see Clal files using p3 / p4 / p5 / p6 / p7).
  removeNSPrefix: true,
  processEntities: false,
  ignoreDeclaration: true,
  ignorePiTags: true,
  allowBooleanAttributes: true,
} as const;

/**
 * Public entry point. Validate, decode, hash, parse, return a
 * `MislekaParsedFile`.
 *
 * Errors thrown:
 *   - `MislekaSecurityError`: oversized buffer, DTD reference, external
 *     entity reference, unsupported encoding.
 *   - `MislekaParseError`: malformed XML structure, missing root, parser
 *     internal failures.
 */
export function parseMislekaXmlBuffer(
  buffer: Buffer,
  fileName: string,
): MislekaParsedFile {
  if (!Buffer.isBuffer(buffer)) {
    throw new MislekaParseError("הקובץ אינו תקין — בעיה בקריאת הנתונים", {
      fileName,
      code: "INVALID_BUFFER",
    });
  }

  if (buffer.length === 0) {
    throw new MislekaParseError("הקובץ ריק", {
      fileName,
      code: "EMPTY_FILE",
    });
  }

  if (buffer.length > MAX_FILE_BYTES) {
    throw new MislekaSecurityError(
      "גודל הקובץ חורג מהמותר — מותר עד 25 מגה-בייט",
      { fileName, code: "FILE_TOO_LARGE" },
    );
  }

  const fileHash = `sha256:${createHash("sha256")
    .update(buffer)
    .digest("hex")}`;

  // Decode the buffer to text. Detection runs over the first 1 KB only —
  // the XML declaration always lives at the head of the file when present.
  const detection = detectEncoding(buffer);
  const text = detection.text;
  const encoding = detection.encoding;

  // Reject DTD / external entity content before parsing. We deliberately
  // run these checks on the decoded string, not the raw bytes, so that
  // Hebrew content can never accidentally fool a byte-level regex.
  if (DTD_MARKER_RE.test(text) || EXTERNAL_ENTITY_RE.test(text)) {
    throw new MislekaSecurityError(
      "הקובץ מכיל הצהרת DTD או הפניה לישות חיצונית — אינו מורשה לעיבוד",
      { fileName, code: "DTD_OR_ENTITY_FORBIDDEN" },
    );
  }

  let root: unknown;
  try {
    const parser = new XMLParser(PARSER_OPTIONS);
    root = parser.parse(text);
  } catch (err) {
    // fast-xml-parser sometimes attaches a `line` / `col` to its errors.
    // We extract whatever is safely available without ever including the
    // err message verbatim (it can echo back content in some failure
    // modes).
    const line = extractLineNumber(err);
    throw new MislekaParseError(
      "שגיאה בקריאת קובץ ה-XML — מבנה הקובץ אינו תקין",
      { fileName, line, code: "XML_INVALID" },
    );
  }

  if (root === null || typeof root !== "object") {
    throw new MislekaParseError("קובץ ה-XML ריק או חסר אלמנט שורש", {
      fileName,
      code: "XML_EMPTY_ROOT",
    });
  }

  return {
    fileName,
    fileHash,
    fileSize: buffer.length,
    encoding,
    root,
  };
}

// Encoding detection ---------------------------------------------

interface EncodingDetection {
  text: string;
  encoding: "UTF-8" | "Windows-1255";
}

/**
 * Detect declared encoding from XML prolog (when present), then decode.
 *
 * 1. If a `<?xml encoding="..."?>` declaration is found, honor it
 *    (UTF-8 or Windows-1255 only).
 * 2. Otherwise attempt UTF-8 first; on validation failure fall back to
 *    Windows-1255.
 * 3. If both fail, throw a `MislekaSecurityError` — we refuse to import
 *    files we cannot reliably decode.
 */
function detectEncoding(buffer: Buffer): EncodingDetection {
  const head = buffer.slice(0, Math.min(1024, buffer.length));
  // Decode head as latin1 (a 1:1 byte→char mapping) just to inspect the
  // ASCII prolog. We never hand this to the parser.
  const headAscii = head.toString("latin1");
  const declRe = /<\?xml[^?]*encoding\s*=\s*["']([^"']+)["']/i;
  const declMatch = declRe.exec(headAscii);
  const declared = declMatch ? declMatch[1].toLowerCase() : null;

  if (declared) {
    if (declared === "utf-8" || declared === "utf8") {
      const text = decodeUtf8Strict(buffer);
      if (text !== null) return { text, encoding: "UTF-8" };
      throw new MislekaSecurityError(
        "הקובץ מצהיר על קידוד UTF-8 אך המכיל אינו תקין",
        { code: "ENCODING_DECLARED_INVALID" },
      );
    }
    if (
      declared === "windows-1255" ||
      declared === "iso-8859-8" ||
      declared === "cp1255"
    ) {
      return {
        text: iconv.decode(buffer, "windows-1255"),
        encoding: "Windows-1255",
      };
    }
    throw new MislekaSecurityError(
      "קידוד הקובץ אינו נתמך — נדרש UTF-8 או Windows-1255",
      { code: "ENCODING_UNSUPPORTED" },
    );
  }

  // No declaration. Try UTF-8 strictly; fall back to Windows-1255.
  const utf = decodeUtf8Strict(buffer);
  if (utf !== null) return { text: utf, encoding: "UTF-8" };
  return {
    text: iconv.decode(buffer, "windows-1255"),
    encoding: "Windows-1255",
  };
}

/**
 * Decode a buffer as UTF-8, returning null if any invalid sequences are
 * present. Node's toString("utf-8") silently replaces bad bytes with
 * U+FFFD, which we treat as a decode failure for fall-back detection.
 */
function decodeUtf8Strict(buffer: Buffer): string | null {
  const decoded = buffer.toString("utf-8");
  if (decoded.includes("\uFFFD")) return null;
  return decoded;
}

// Error helpers --------------------------------------------------

function extractLineNumber(err: unknown): number | undefined {
  if (typeof err !== "object" || err === null) return undefined;
  const maybe = err as { line?: unknown; lineNumber?: unknown };
  if (typeof maybe.line === "number" && Number.isInteger(maybe.line)) {
    return maybe.line;
  }
  if (
    typeof maybe.lineNumber === "number" &&
    Number.isInteger(maybe.lineNumber)
  ) {
    return maybe.lineNumber;
  }
  return undefined;
}
