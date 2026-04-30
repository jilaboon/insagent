/**
 * Read `MislekaFileMetadata` (KoteretKovetz / YeshutYatzran header
 * fields) from a parsed Misleka tree.
 *
 * The provider code may live in `KoteretKovetz/KOD-SHOLEACH` (always
 * present in the 8 sample files) or, as a fallback, in
 * `YeshutYatzran/KOD-MEZAHE-YATZRAN`. The two are usually identical,
 * but the fallback is a safety net for files that omit one or the other.
 *
 * The interface code in the file name (KGM / INP / ING) is a more
 * specific marker than SUG-MIMSHAK; we resolve both and prefer the
 * file-name code when available.
 */

import type {
  MislekaFileMetadata,
  MislekaParsedFile,
  MislekaWarning,
} from "./types";
import {
  INTERFACE_FILENAME_LABELS,
  INTERFACE_TYPE_LABELS,
  resolveLabel,
} from "./code-maps";
import { findField, findAllNodes, parseMislekaDate } from "./columns";

export interface MislekaMetadataResult {
  metadata: MislekaFileMetadata;
  warnings: MislekaWarning[];
}

const FILENAME_INTERFACE_RE = /_(KGM|INP|ING)_/i;

/**
 * Read metadata from a parsed file. Never throws — missing fields
 * become null and a warning is appended.
 */
export function detectMislekaMetadata(
  parsed: MislekaParsedFile,
): MislekaMetadataResult {
  const warnings: MislekaWarning[] = [];
  const root = parsed.root;
  const mimshak = (root as Record<string, unknown>)["Mimshak"] ?? root;

  const koteret = readObject(mimshak, "KoteretKovetz");
  const yeshut = readObject(mimshak, "YeshutYatzran");

  const providerCode =
    findField(koteret, "KOD-SHOLEACH") ??
    findField(yeshut, "KOD-MEZAHE-YATZRAN") ??
    "";
  if (!providerCode) {
    warnings.push({
      code: "MISSING_PROVIDER_CODE",
      message: "לא נמצא קוד שולח / יצרן בכותרת הקובץ",
    });
  }

  const providerName =
    findField(koteret, "SHEM-SHOLEACH") ??
    findField(yeshut, "SHEM-YATZRAN") ??
    "";
  if (!providerName) {
    warnings.push({
      code: "MISSING_PROVIDER_NAME",
      message: "לא נמצא שם שולח / יצרן בכותרת הקובץ",
    });
  }

  const interfaceCodeRaw = findField(koteret, "SUG-MIMSHAK");
  const interfaceFromFamily = resolveLabel(
    INTERFACE_TYPE_LABELS,
    interfaceCodeRaw,
  );
  const interfaceFromFilename = readInterfaceFromFileName(parsed.fileName);
  const interfaceTypeLabel =
    interfaceFromFilename ?? interfaceFromFamily.label;

  if (!interfaceFromFamily.isKnown && interfaceCodeRaw) {
    warnings.push({
      code: "UNKNOWN_INTERFACE_TYPE_CODE",
      message: "סוג ממשק לא מוכר",
      value: interfaceCodeRaw,
    });
  }

  const productTypes = collectDistinctProductTypes(mimshak);

  return {
    metadata: {
      providerCode: providerCode || "",
      providerName: providerName || "",
      handlerCode: findField(koteret, "KOD-MEZAHE-METAFEL"),
      handlerName: findField(koteret, "SHEM-METAFEL"),
      xmlVersion: findField(koteret, "MISPAR-GIRSAT-XML") ?? "",
      interfaceTypeCode: interfaceCodeRaw ?? "",
      interfaceTypeLabel,
      direction: findField(koteret, "KIVUN-MIMSHAK-XML"),
      executionDate: parseMislekaDate(findField(koteret, "TAARICH-BITZUA")),
      fileNumber: findField(koteret, "MISPAR-HAKOVETZ"),
      transferId: findField(koteret, "MEZAHE-HAAVARA"),
      productTypes,
    },
    warnings,
  };
}

// Helpers ---------------------------------------------------------

function readObject(
  parent: unknown,
  tagName: string,
): Record<string, unknown> | null {
  if (typeof parent !== "object" || parent === null || Array.isArray(parent)) {
    return null;
  }
  const child = (parent as Record<string, unknown>)[tagName];
  if (typeof child === "object" && child !== null && !Array.isArray(child)) {
    return child as Record<string, unknown>;
  }
  return null;
}

function readInterfaceFromFileName(fileName: string): string | null {
  const match = FILENAME_INTERFACE_RE.exec(fileName);
  if (!match) return null;
  const code = match[1].toUpperCase();
  return INTERFACE_FILENAME_LABELS[code] ?? null;
}

/**
 * Walk the tree to find every distinct SUG-MUTZAR code under any Mutzar
 * node. The structure is:
 *   Mimshak / YeshutYatzran / Mutzarim / Mutzar / NetuneiMutzar / SUG-MUTZAR
 */
function collectDistinctProductTypes(mimshak: unknown): string[] {
  const yeshut = readObject(mimshak, "YeshutYatzran");
  if (!yeshut) return [];
  const mutzarim = readObject(yeshut, "Mutzarim");
  if (!mutzarim) return [];
  const mutzarNodes = findAllNodes(mutzarim, "Mutzar");
  const seen = new Set<string>();
  for (const m of mutzarNodes) {
    const code = findField(m, ["NetuneiMutzar", "SUG-MUTZAR"]);
    if (code) seen.add(code);
  }
  return Array.from(seen);
}
