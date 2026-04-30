/**
 * Read a `MislekaCustomerCandidate` (customer identity) from a parsed
 * Misleka file.
 *
 * The customer block lives at:
 *   Mimshak / YeshutYatzran / Mutzarim / Mutzar / NetuneiMutzar / YeshutLakoach
 *
 * For files with multiple Mutzar nodes (the Altshuler educational-fund
 * file has 4 in one file), the first Mutzar with a populated YeshutLakoach
 * is used as the source of customer identity. All Mutzar blocks for the
 * same Misleka file always describe the same person — the file is
 * customer-scoped — so this is safe.
 */

import type {
  MislekaCustomerCandidate,
  MislekaParsedFile,
  MislekaWarning,
} from "./types";
import {
  GENDER_LABELS,
  MARITAL_STATUS_LABELS,
  resolveLabel,
} from "./code-maps";
import {
  cleanText,
  findAllNodes,
  findField,
  normalizeIsraeliId,
  normalizePhone,
  parseMislekaDate,
} from "./columns";

export interface MislekaCustomerResult {
  customer: MislekaCustomerCandidate;
  warnings: MislekaWarning[];
}

/**
 * Read the customer candidate. Returns an all-null candidate if no
 * YeshutLakoach is found anywhere — the caller should treat that as a
 * structural anomaly and surface a warning.
 */
export function readMislekaCustomer(
  parsed: MislekaParsedFile,
): MislekaCustomerResult {
  const warnings: MislekaWarning[] = [];
  const root = parsed.root;
  const mimshak = (root as Record<string, unknown>)["Mimshak"] ?? root;
  const yeshut = readObject(mimshak, "YeshutYatzran");
  const mutzarim = readObject(yeshut, "Mutzarim");

  if (!mutzarim) {
    warnings.push({
      code: "MISSING_MUTZARIM",
      message: "מבנה הקובץ אינו תקין — לא נמצא בלוק מוצרים",
    });
    return { customer: emptyCandidate(), warnings };
  }

  const mutzarNodes = findAllNodes(mutzarim, "Mutzar");
  let yeshutLakoach: Record<string, unknown> | null = null;
  let chosenIndex = -1;
  for (let i = 0; i < mutzarNodes.length; i++) {
    const candidate = readObject(
      readObject(mutzarNodes[i], "NetuneiMutzar"),
      "YeshutLakoach",
    );
    if (candidate) {
      yeshutLakoach = candidate;
      chosenIndex = i;
      break;
    }
  }

  if (!yeshutLakoach) {
    warnings.push({
      code: "MISSING_YESHUT_LAKOACH",
      message: "לא נמצאו פרטי לקוח בקובץ",
    });
    return { customer: emptyCandidate(), warnings };
  }

  const rawIsraeliId = findField(yeshutLakoach, "MISPAR-ZIHUY-LAKOACH");
  const israeliId = normalizeIsraeliId(rawIsraeliId);
  if (!israeliId) {
    warnings.push({
      code: "MISSING_ISRAELI_ID",
      message: "לא נמצא מספר זהות תקין ללקוח בקובץ",
      path: pathOfMutzar(chosenIndex),
    });
  }

  const firstName = cleanText(findField(yeshutLakoach, "SHEM-PRATI"));
  const lastName = cleanText(findField(yeshutLakoach, "SHEM-MISHPACHA"));
  const fullName =
    firstName && lastName
      ? `${firstName} ${lastName}`
      : firstName ?? lastName ?? null;

  const genderCode = findField(yeshutLakoach, "MIN");
  const gender = resolveLabel(GENDER_LABELS, genderCode);
  if (genderCode && !gender.isKnown) {
    warnings.push({
      code: "UNKNOWN_GENDER_CODE",
      message: "קוד מין לא מוכר",
      value: genderCode,
      path: `${pathOfMutzar(chosenIndex)}/YeshutLakoach/MIN`,
    });
  }

  const maritalStatusCode = findField(yeshutLakoach, "MATZAV-MISHPACHTI");
  const maritalStatus = resolveLabel(MARITAL_STATUS_LABELS, maritalStatusCode);
  if (maritalStatusCode && !maritalStatus.isKnown) {
    warnings.push({
      code: "UNKNOWN_MARITAL_STATUS_CODE",
      message: "קוד מצב משפחתי לא מוכר",
      value: maritalStatusCode,
      path: `${pathOfMutzar(chosenIndex)}/YeshutLakoach/MATZAV-MISHPACHTI`,
    });
  }

  // Phone — prefer cellular, fall back to landline. NULLNULL handled
  // inside normalizePhone.
  const cellular = normalizePhone(findField(yeshutLakoach, "MISPAR-CELLULARI"));
  const landline = normalizePhone(
    findField(yeshutLakoach, "MISPAR-TELEPHONE-KAVI"),
  );
  const phone = cellular ?? landline;

  // Address: street + house number stored separately, plus city.
  const street = cleanText(findField(yeshutLakoach, "SHEM-RECHOV"));
  const houseNumber = cleanText(findField(yeshutLakoach, "MISPAR-BAIT"));
  const city = cleanText(findField(yeshutLakoach, "SHEM-YISHUV"));
  const postalCode = cleanText(findField(yeshutLakoach, "MIKUD"));
  const email = cleanText(findField(yeshutLakoach, "E-MAIL"));

  return {
    customer: {
      israeliId,
      rawIsraeliId: cleanText(rawIsraeliId),
      firstName,
      lastName,
      fullName,
      gender: genderCode ? gender.label : null,
      genderCode,
      dateOfBirth: parseMislekaDate(findField(yeshutLakoach, "TAARICH-LEYDA")),
      maritalStatus: maritalStatusCode ? maritalStatus.label : null,
      maritalStatusCode,
      email,
      phone,
      city,
      street,
      houseNumber,
      postalCode,
    },
    warnings,
  };
}

// Helpers --------------------------------------------------------

function emptyCandidate(): MislekaCustomerCandidate {
  return {
    israeliId: null,
    rawIsraeliId: null,
    firstName: null,
    lastName: null,
    fullName: null,
    gender: null,
    genderCode: null,
    dateOfBirth: null,
    maritalStatus: null,
    maritalStatusCode: null,
    email: null,
    phone: null,
    city: null,
    street: null,
    houseNumber: null,
    postalCode: null,
  };
}

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

function pathOfMutzar(index: number): string {
  return `Mutzarim/Mutzar[${index + 1}]`;
}
