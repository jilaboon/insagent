/**
 * Shared types for the Misleka XML import pipeline.
 * Each module (parser, normalizer, matcher, persister, pipeline) consumes
 * and produces these types. Keep this file the single source of truth.
 */

// ============================================================
// File-level (raw) parsing
// ============================================================

export interface MislekaParsedFile {
  fileName: string;
  fileHash: string; // SHA-256 hex
  fileSize: number;
  encoding: "UTF-8" | "Windows-1255";
  // The fast-xml-parser tree, parsed safely (DTD off, entities off, size cap).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  root: any;
}

// ============================================================
// File-level metadata (header / KoteretKovetz fields)
// ============================================================

export interface MislekaFileMetadata {
  providerCode: string; // KOD-SHOLEACH (9-digit Israeli company tax ID)
  providerName: string; // SHEM-SHOLEACH
  handlerCode: string | null; // KOD-MEZAHE-METAFEL
  handlerName: string | null; // SHEM-METAFEL
  xmlVersion: string; // MISPAR-GIRSAT-XML, e.g. "009"
  interfaceTypeCode: string; // SUG-MIMSHAK raw code
  interfaceTypeLabel: string; // KGM / INP / ING (resolved)
  direction: string | null; // KIVUN-MIMSHAK-XML
  executionDate: Date | null; // TAARICH-BITZUA
  fileNumber: string | null; // MISPAR-HAKOVETZ
  transferId: string | null; // MEZAHE-HAAVARA
  productTypes: string[]; // distinct SUG-MUTZAR codes encountered
}

// ============================================================
// Customer identity extracted from a file
// ============================================================

export interface MislekaCustomerCandidate {
  israeliId: string | null; // normalized: stripped non-digits, padded to 9 chars with leading zeros
  rawIsraeliId: string | null; // as-seen in the file (before normalization)
  firstName: string | null; // SHEM-PRATI
  lastName: string | null; // SHEM-MISHPACHA
  fullName: string | null; // best-effort joined display name
  gender: string | null; // resolved label ("זכר" / "נקבה")
  genderCode: string | null; // raw MIN code
  dateOfBirth: Date | null; // TAARICH-LEYDA
  maritalStatus: string | null; // resolved label
  maritalStatusCode: string | null; // raw MATZAV-MISHPACHTI code
  email: string | null;
  phone: string | null;
  city: string | null;
  street: string | null;
  houseNumber: string | null;
  postalCode: string | null;
}

// ============================================================
// Product extraction (one record per Mutzar)
// ============================================================

export interface MislekaProductRecord {
  sourceRecordPath: string; // XPath-ish, e.g. "Mutzarim/Mutzar[1]"
  productTypeCode: string; // SUG-MUTZAR
  productTypeLabel: string | null; // resolved Hebrew label
  planName: string | null; // SHEM-TOCHNIT (right-trimmed)
  policyOrAccountNumber: string | null; // MISPAR-POLISA-O-HESHBON
  unifiedProductCode: string | null; // KIDOD-ACHID
  statusCode: string | null; // STATUS-POLISA-O-CHESHBON
  statusLabel: string | null; // resolved label
  isActive: boolean; // status == ACTIVE
  joinDate: Date | null; // TAARICH-HITZTARFUT-MUTZAR
  firstJoinDate: Date | null; // TAARICH-HITZTARFUT-RISHON
  lastUpdatedDate: Date | null; // TAARICH-IDKUN-STATUS
  valuationDate: Date | null; // TAARICH-NECHONUT
  hasLoan: boolean;
  hasArrears: boolean;
  hasExternalCoverage: boolean;
  hasBeneficiaries: boolean;
  hasAttorney: boolean;
  employerName: string | null; // SHEM-MAASIK
  employerCode: string | null; // MPR-MAASIK-BE-YATZRAN
  rawImportantFieldsJson: Record<string, unknown> | null; // sanitized snapshot

  // Time-series snapshots discovered for this product.
  balances: MislekaBalanceRecord[];

  // Per-product warnings (unknown codes, missing fields).
  warnings: MislekaWarning[];
}

export interface MislekaBalanceRecord {
  snapshotDate: Date;
  snapshotKind: "TRACK_BALANCE" | "PRODUCT_TOTAL" | "REDEMPTION" | "BLOCK";
  trackCode: string | null;
  trackName: string | null;
  balanceAmount: number | null;
  redemptionAmount: number | null;
  monthlyContribution: number | null;
  employeeContribution: number | null;
  employerContribution: number | null;
  compensationComponent: number | null;
  ytdReturn: number | null;
  rawJson: Record<string, unknown> | null;
}

// ============================================================
// Warnings (non-fatal parse issues)
// ============================================================

export interface MislekaWarning {
  code: string; // e.g. "UNKNOWN_STATUS_CODE", "MISSING_FIELD"
  message: string; // Hebrew, safe (no PII)
  path?: string; // XPath-ish where the issue was found
  value?: string; // raw value (only when not sensitive)
}

// ============================================================
// Aggregated extraction output for one file
// ============================================================

export interface MislekaFileExtraction {
  metadata: MislekaFileMetadata;
  customer: MislekaCustomerCandidate;
  products: MislekaProductRecord[];
  warnings: MislekaWarning[];
  errors: MislekaWarning[]; // parse-level errors that didn't abort the whole file
}

// ============================================================
// Customer matching
// ============================================================

export type MatchConfidence = "HIGH" | "MEDIUM" | "LOW" | "NONE";

export interface CustomerMatchResult {
  confidence: MatchConfidence;
  customerId: string | null; // null when confidence === NONE or LOW (manual review)
  reason: string; // short Hebrew explanation
  candidateCustomerId?: string; // for LOW: the suggested match awaiting review
  candidateCustomerName?: string;
}

// ============================================================
// Pipeline result (returned from /api/import/misleka/upload)
// ============================================================

export interface MislekaImportReportFile {
  fileName: string;
  providerCode: string;
  providerName: string;
  productCount: number;
  warningCount: number;
}

export interface MislekaImportReportManualReview {
  fileName: string;
  candidateCustomerId: string;
  candidateCustomerName: string;
  confidence: MatchConfidence;
  reason: string;
}

export interface MislekaImportReport {
  importJobId: string;
  fileCount: number;
  filesProcessed: MislekaImportReportFile[];
  matchedCustomers: number;
  newCustomers: number;
  manualReviewQueue: MislekaImportReportManualReview[];
  productsCreated: number;
  productsUpdated: number;
  balanceSnapshotsCreated: number;
  warnings: MislekaWarning[];
  errors: MislekaWarning[];
  durationMs: number;
}

// ============================================================
// Consent contract on the upload route
// ============================================================

export type ConsentSource =
  | "CUSTOMER_VERBAL"
  | "CUSTOMER_SIGNED"
  | "AGENT_REPRESENTED"
  | "DEMO_INTERNAL";

export type ConsentScope = "MISLEKA_PRODUCTS" | "FULL_360" | "DEMO_INTERNAL";

export interface ConsentInput {
  source: ConsentSource;
  scope: ConsentScope;
  date: string; // ISO date
  recordedBy: string; // operator email
  docRef?: string;
  bypassConsent?: boolean; // OWNER + DEMO_INTERNAL only
}
