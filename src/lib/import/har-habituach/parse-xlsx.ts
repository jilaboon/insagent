/**
 * Parse a Har HaBituach xlsx buffer into raw rows keyed by the Hebrew
 * headers. Uses the `xlsx` package (server-side only — the buffer never
 * leaves the server).
 *
 * Throws a ParseError with a safe, PII-free message if the file is malformed.
 */

import * as xlsx from "xlsx";
import type { HarHabituachRawRow } from "./columns";
import { HAR_HABITUACH_REQUIRED_HEADERS } from "./columns";

export class HarHabituachParseError extends Error {}

export interface ParsedHarHabituach {
  sheetName: string;
  headers: string[];
  rows: HarHabituachRawRow[];
}

/**
 * Parse an xlsx buffer. Looks for a sheet named "פוטנציאלים" first;
 * falls back to the first sheet if not found.
 */
export function parseHarHabituachBuffer(buffer: Buffer): ParsedHarHabituach {
  let wb: xlsx.WorkBook;
  try {
    wb = xlsx.read(buffer, { type: "buffer" });
  } catch {
    // Swallow the xlsx internal error — the message can include filesystem
    // paths or header contents we don't want to leak to the client.
    throw new HarHabituachParseError("לא ניתן לקרוא את קובץ ה-Excel");
  }

  if (!wb.SheetNames.length) {
    throw new HarHabituachParseError("הקובץ ריק");
  }

  // Prefer the "פוטנציאלים" sheet; fall back to the first sheet.
  const preferred = "פוטנציאלים";
  const sheetName = wb.SheetNames.includes(preferred)
    ? preferred
    : wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];

  // Read as objects keyed by the header row — xlsx auto-detects the header.
  const rows = xlsx.utils.sheet_to_json<HarHabituachRawRow>(ws, {
    defval: null,
    raw: false, // keep string formatting for dates
  });

  if (rows.length === 0) {
    throw new HarHabituachParseError(`הגיליון "${sheetName}" ריק`);
  }

  const headers = Object.keys(rows[0]);

  // Validate required headers exist
  const missing = HAR_HABITUACH_REQUIRED_HEADERS.filter(
    (h) => !headers.includes(h)
  );
  if (missing.length) {
    throw new HarHabituachParseError(
      `חסרות עמודות חובה: ${missing.join(", ")}`
    );
  }

  return { sheetName, headers, rows };
}
