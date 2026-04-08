import * as iconv from "iconv-lite";
import { parse } from "csv-parse/sync";

export interface ParsedCsvResult {
  headers: string[];
  rows: Record<string, string>[];
  totalRows: number;
}

/**
 * Parse a CSV buffer with the given encoding (default Windows-1255 for BAFI exports).
 * Returns rows as objects keyed by Hebrew column headers.
 */
export function parseCsvBuffer(
  buffer: Buffer,
  encoding: BufferEncoding | "windows-1255" = "windows-1255"
): ParsedCsvResult {
  // Decode from Windows-1255 (or other encoding) to UTF-8
  const decoded =
    encoding === "utf-8" || encoding === "utf8"
      ? buffer.toString("utf-8")
      : iconv.decode(buffer, encoding);

  // Parse CSV with headers
  const records: Record<string, string>[] = parse(decoded, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    trim: true,
    relax_column_count: true,
  });

  // Extract headers from first record keys
  const headers = records.length > 0 ? Object.keys(records[0]) : [];

  return {
    headers,
    rows: records,
    totalRows: records.length,
  };
}

// ============================================================
// Field transform helpers
// ============================================================

/** Parse DD/MM/YYYY or DD/MM/YYYY HH:mm date string to Date */
export function parseHebrewDate(value: string): Date | null {
  if (!value || value.trim() === "") return null;
  const trimmed = value.trim();

  // Handle DD/MM/YYYY HH:mm:ss format
  const parts = trimmed.split(" ")[0].split("/");
  if (parts.length !== 3) return null;

  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const year = parseInt(parts[2], 10);

  if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
  if (year < 1900 || year > 2100) return null;

  return new Date(year, month - 1, day);
}

/** Parse a number string (possibly with commas) to float */
export function parseNumber(value: string): number | null {
  if (!value || value.trim() === "") return null;
  const cleaned = value.trim().replace(/,/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

/** Parse integer */
export function parseInteger(value: string): number | null {
  if (!value || value.trim() === "") return null;
  const num = parseInt(value.trim(), 10);
  return isNaN(num) ? null : num;
}

/** Clean and trim string, return null for empty */
export function cleanString(value: string): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}
