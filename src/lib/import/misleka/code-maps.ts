/**
 * Single source of truth for Misleka coded values → Hebrew labels.
 *
 * Codes derive from the מבנה אחיד spec and from the codes actually present
 * in the 8 Max Segal sample files (Meitav / Altshuler / Harel / Migdal / Clal).
 *
 * Unknown codes resolve to "קוד לא מזוהה (N)" with `isKnown: false` so the
 * pipeline can surface a warning rather than silently dropping the value.
 *
 * Key identifiers stay English; UI strings stay Hebrew. Hebrew and English
 * never appear on the same line of a comment or label.
 */

export type CodeMap = Readonly<Record<string, string>>;

// ---------------------------------------------------------------
// SUG-MUTZAR — product type
// Source: ASCII spec table § product types
// ---------------------------------------------------------------
export const PRODUCT_TYPE_LABELS: CodeMap = {
  "1": "ביטוח חיים",
  "2": "השתלמות / חיסכון",
  "3": "פנסיה",
  "4": "השתלמות",
  "5": "פנסיה מקיפה",
  "6": "ביטוח חיים מקובץ",
};

// ---------------------------------------------------------------
// STATUS-POLISA-O-CHESHBON — policy / account status
// ---------------------------------------------------------------
export const STATUS_LABELS: CodeMap = {
  "1": "פעיל",
  "2": "סגור / שונה",
  "3": "מצבור בלבד",
  "4": "דחוי",
  "5": "תלוי",
};

// Status codes considered "active" for the boolean isActive flag.
export const ACTIVE_STATUS_CODES: ReadonlySet<string> = new Set(["1"]);

// ---------------------------------------------------------------
// SUG-MIMSHAK — interface family
// 1 = INP (insurance feed), 2 = KGM (pension / provident feed)
// The actual interface code (KGM / INP / ING) appears in the file name.
// ---------------------------------------------------------------
export const INTERFACE_TYPE_LABELS: CodeMap = {
  "1": "INP",
  "2": "KGM",
};

/**
 * Map a file-name interface token (KGM / INP / ING) into a canonical label.
 * The file-name token is the authoritative interface code — SUG-MIMSHAK is
 * a coarser family code.
 */
export const INTERFACE_FILENAME_LABELS: CodeMap = {
  KGM: "KGM",
  INP: "INP",
  ING: "ING",
};

// ---------------------------------------------------------------
// MIN — gender
// ---------------------------------------------------------------
export const GENDER_LABELS: CodeMap = {
  "1": "זכר",
  "2": "נקבה",
};

// ---------------------------------------------------------------
// MATZAV-MISHPACHTI — marital status
// ---------------------------------------------------------------
export const MARITAL_STATUS_LABELS: CodeMap = {
  "1": "רווק",
  "2": "נשוי",
  "3": "גרוש",
  "4": "אלמן",
  "5": "אחר",
};

// ---------------------------------------------------------------
// SUG-MEZAHE-LAKOACH — identifier type
// 1 = ת.ז, 2 = דרכון, 3 = תעודה זרה, 4 = מספר זהות חוקי
// ---------------------------------------------------------------
export const IDENTIFIER_TYPE_LABELS: CodeMap = {
  "1": "תעודת זהות",
  "2": "דרכון",
  "3": "תעודה זרה",
  "4": "מספר זהות חוקי",
};

// ---------------------------------------------------------------
// TADIRUT-TASHLUM — payment frequency
// ---------------------------------------------------------------
export const PAYMENT_FREQUENCY_LABELS: CodeMap = {
  "1": "חודשי",
  "2": "דו-חודשי",
  "3": "רבעוני",
  "4": "חצי שנתי",
  "5": "שנתי",
};

// ---------------------------------------------------------------
// SUG-HAFRASHA — contribution type
// 8 = employee, 9 = employer, 11 = premium, plus other codes seen in
// sample files (4 = pizoy / education-fund split markers, etc.).
// ---------------------------------------------------------------
export const CONTRIBUTION_TYPE_LABELS: CodeMap = {
  "1": "תגמולי עובד",
  "2": "תגמולי מעסיק",
  "3": "פיצויים",
  "4": "השלמת פיצויים",
  "5": "אובדן כושר עבודה",
  "8": "הפקדת עובד",
  "9": "הפקדת מעסיק",
  "11": "פרמיה",
};

// ---------------------------------------------------------------
// PTIRA — alive / deceased
// 1 = deceased, 2 = alive
// ---------------------------------------------------------------
export const PTIRA_LABELS: CodeMap = {
  "1": "נפטר",
  "2": "בחיים",
};

// ---------------------------------------------------------------
// Provider code → short Hebrew name (5 known issuers from Max Segal sample).
// Used for traceability in warnings; the canonical name comes from the
// SHEM-SHOLEACH tag and is what the persister stores.
// ---------------------------------------------------------------
export const KNOWN_PROVIDER_SHORT_NAMES: CodeMap = {
  "512065202": "מיטב",
  "513173393": "אלטשולר שחם",
  "520004078": "הראל",
  "520004896": "מגדל",
  "520024647": "כלל",
};

// ---------------------------------------------------------------
// Resolution helper
// ---------------------------------------------------------------
export interface LabelResolution {
  label: string;
  isKnown: boolean;
}

/**
 * Look up a coded value in a Hebrew label map.
 *
 * Returns `{ label, isKnown }`:
 * - `isKnown: true` for codes that exist in the map.
 * - `isKnown: false` and `label = "קוד לא מזוהה (N)"` for unknown codes.
 * - `isKnown: false` and `label = "—"` for null / empty input.
 *
 * Callers that need to warn on unknown codes should branch on `isKnown`.
 */
export function resolveLabel(
  map: CodeMap,
  code: string | null | undefined,
): LabelResolution {
  if (code === null || code === undefined || code === "") {
    return { label: "—", isKnown: false };
  }
  const known = map[code];
  if (known) return { label: known, isKnown: true };
  return { label: `קוד לא מזוהה (${code})`, isKnown: false };
}

/**
 * Convenience: yes/no flags coded as 1=yes, 2=no in Misleka files.
 * Returns true only for explicit "1"; null and "2" return false; any
 * other value returns false (and would benefit from a warning at the
 * caller site, hence the `isKnown` companion).
 */
export function resolveYesNo(code: string | null | undefined): {
  value: boolean;
  isKnown: boolean;
} {
  if (code === null || code === undefined || code === "") {
    return { value: false, isKnown: false };
  }
  if (code === "1") return { value: true, isKnown: true };
  if (code === "2") return { value: false, isKnown: true };
  return { value: false, isKnown: false };
}
