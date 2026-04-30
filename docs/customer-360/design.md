# Customer 360 + Misleka XML Import — Design Document

**Status**: Draft for approval — revision 2 (2026-04-30, post-review)
**Owner**: Backend + product
**Scope**: Phase 1 + Phase 2 + Phase 3 (banking is Phase 4, scaffolding only)

**Revision 2 changes** (in response to review feedback):
- Multi-file imports: per-file metadata moved into `ImportJob.metadataJson.files[]`; scalar provider/version fields removed from the table
- Rollback uses `deletedAt`/`deletedBy` instead of overloading `status`
- `CustomerBalanceSnapshot` uniqueness extended with `trackCode` + `snapshotKind`
- `CustomerFinancialProduct` uses a deterministic `sourceStableKey` instead of nullable composite uniqueness
- Consent is now a hard requirement at the upload route; demo bypass is explicit and audit-logged
- Audit logging refined: page-render trail dropped, sensitive-section expansion + daily session aggregate instead
- Role gating clarified: AGENT sees assigned customers only
- `CustomerContext` enrichment is a batch operation (4 queries per batch, not per customer)
- `MISLEKA_ONLY` added to `Customer.source` semantics with UI/constants impact
- Encoding policy: detect declared encoding; UTF-8 + Windows-1255 supported; reject only when undeclared and undetectable

---

## 1. Product goal and first milestone

### 1.1 The vision

זרקור becomes a Customer 360 intelligence layer for the agency. One place that aggregates every signal about a customer — agency policies, external policies, institutional pension and provident accounts, banking later, agent notes — and turns it into propensity, opportunity, and timing.

The 360 view is the workspace. The real value is the rule engine answering:

> *"This customer is likely to need / buy / review / consolidate X right now, because of signals A, B, C."*

### 1.2 First milestone (acceptance bar)

Import Max Segal's eight Misleka XML files end-to-end:

- Detect provider for each file (5 providers: Meitav, Altshuler, Harel, Migdal, Clal)
- Parse the standard מבנה אחיד structure tolerantly
- Match the data to Max Segal by national ID with high confidence
- Store institutional products in `CustomerFinancialProduct` linked to him
- Store balance snapshots where present
- Surface the new section "פנסיה, גמל והשתלמות" on the upgraded Customer 360
- Show source badges on every fact (משרד / הר הביטוח / מסלקה / ידני)
- Generate 3–5 cautious propensity insights from the new data
- Provide an import report with warnings for partially-supported fields
- Pass all security checks: XXE off, no raw XML logs, role-gated, audit-logged

---

## 2. Architecture summary

### 2.1 Layered model

| Layer | Purpose | Implementation |
|-------|---------|----------------|
| **Identity** | Who this person is | `Customer` (existing), with consent fields |
| **Asset / Product** | What they own — insurance, pension, savings, future banking | `Policy` (agency insurance) + `CustomerFinancialProduct` (institutional) + future `CustomerBankAccount`, `CustomerLoan` |
| **Source** | Where each fact came from | `ImportJob` extended with kind + per-record provenance through linkage |
| **Quality** | Freshness, missing fields, conflicts | Computed at the read-model level |
| **Intelligence** | Insights, opportunities, risks | Existing rule engine, fed by `CustomerContext` |
| **Action** | What the agent should do next | Existing insight → queue → session pipeline |

### 2.2 The propensity engine

`CustomerContext` is a derived read-model — not a table on day one. It extends the existing `CustomerProfile` with fields that combine all sources. The rule engine queries `CustomerContext` instead of digging into raw tables. New propensity rules ship as `OfficeRule` records with the existing `triggerCondition` DSL extended with new clauses.

### 2.3 Why `CustomerFinancialProduct` and not extending `Policy`

The existing `Policy` table is shaped around agency insurance — premium, coverage, vehicle/property fields. Misleka pension and provident products have a different shape: employer-linked contributions, balance time-series, multiple accumulation channels, beneficiary structures, plan-type metadata. Forcing them into `Policy` would clutter the model, mix "agency-managed" with "agency-tracked", and make all existing rules touching `policies` need to learn how to skip non-insurance rows. A separate table starts the right pattern, which then extends naturally to bank accounts, loans, credit cards, and properties.

`Policy` continues to own agency insurance (BAFI + Har HaBituach external policies — both are insurance, both already work). `CustomerFinancialProduct` owns institutional pension / provident / education-fund / savings products from Misleka. Future tables follow the same pattern per source.

---

## 3. Data model changes

### 3.1 Extend `ImportJob`

A single upload event may contain multiple files from multiple providers (the Max Segal demo ships 8 files from 5 providers under one upload). The `ImportJob` therefore represents a **batch**, with batch-level scalar fields and per-file detail in `metadataJson.files[]`. Per-file scalars are deliberately *not* added as columns — that would force one job per file, which fragments the operator's mental model of one upload.

```prisma
enum ImportKind {
  BAFI_LIFE
  BAFI_ELEMENTARY
  HAR_HABITUACH
  MISLEKA_XML
  BANKING_STATEMENT     // placeholder for Phase 4
  BANKING_OPEN_API      // placeholder for Phase 4
}

model ImportJob {
  // ... existing fields ...
  kind              ImportKind?    // null for legacy rows; new rows always set
  warnings          Json?          // batch-level warnings (rolled up across files)
  metadataJson      Json?          // includes files[]; see shape below
  consentSource     String?        // "CUSTOMER_VERBAL" | "CUSTOMER_SIGNED" | "AGENT_REPRESENTED" | "DEMO_INTERNAL"
  consentDate       DateTime?
  consentScope      String?        // "MISLEKA_PRODUCTS" | "FULL_360" | "DEMO_INTERNAL"
  consentRecordedBy String?        // operator email
  consentDocRef     String?        // optional reference / URL to signed consent doc
  deletedAt         DateTime?      // per-import rollback marker (see §9)
  deletedBy         String?        // operator email who initiated rollback
}
```

Shape of `ImportJob.metadataJson` for a Misleka import:

```jsonc
{
  "files": [
    {
      "fileName": "55664098_512065202_KGM_202604231251_1.xml",
      "fileHash": "sha256:7c4b…",         // per-file hash for traceability
      "fileSize": 48721,
      "providerCode": "512065202",
      "providerName": "מיטב גמל ופנסיה בע\"מ",
      "xmlVersion": "009",                // MISPAR-GIRSAT-XML
      "interfaceType": "KGM",             // resolved from SUG-MIMSHAK
      "productTypes": ["4"],              // distinct SUG-MUTZAR codes in this file
      "executionDate": "2026-04-23T09:26:37Z",  // TAARICH-BITZUA
      "encoding": "UTF-8",                // detected encoding
      "warnings": [
        { "code": "UNKNOWN_STATUS_CODE", "value": "9", "path": "Mutzar[1]/STATUS-POLISA-O-CHESHBON" }
      ]
    }
    // ... one entry per file in the batch ...
  ]
}
```

**Why not a separate `ImportJobFile` table?** Phase 1 doesn't need to query per-file as a relational entity. If Phase 2+ requires that (e.g. "show all imports of a specific provider"), promote `metadataJson.files[]` to a real `ImportJobFile` table. The migration is straightforward and isolated.

`fileType` (string) stays for backward compatibility but new code reads `kind`. Migration: backfill `kind` from `fileType` once.

### 3.2 New table — `InstitutionalProvider`

Reference table mapping provider codes to canonical metadata. Replaces the loose `insurer` string field over time.

```prisma
model InstitutionalProvider {
  id            String   @id @default(uuid())
  providerCode  String   @unique     // 9-digit Israeli company tax ID, e.g. "520004078"
  providerName  String                // "הראל חברה לביטוח בע\"מ"
  shortName     String?               // "הראל"
  category      String                // "INSURANCE" | "PENSION" | "BANK" | "AGENCY"
  contactPerson String?
  phone         String?
  email         String?
  address       String?
  isActive      Boolean  @default(true)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  financialProducts CustomerFinancialProduct[]

  @@index([category])
}
```

Seed with the 5 known Misleka providers + extend over time. Later, BAFI's `insurer` field can map to this for unification.

### 3.3 New table — `CustomerFinancialProduct`

```prisma
model CustomerFinancialProduct {
  id                  String   @id @default(uuid())
  customerId          String
  customer            Customer @relation(fields: [customerId], references: [id], onDelete: Cascade)
  providerId          String?
  provider            InstitutionalProvider? @relation(fields: [providerId], references: [id])
  importJobId         String?
  importJob           ImportJob? @relation(fields: [importJobId], references: [id])
  source              String   // "MISLEKA_XML" | "MANUAL" | "BANKING_*" (future)
  sourceFileName      String?  // original filename
  sourceRecordPath    String?  // XPath where this product was found, for traceability

  productTypeCode     String   // SUG-MUTZAR raw code, e.g. "1" / "4" / "6"
  productTypeLabel    String?  // Hebrew label resolved from code map
  interfaceType       String?  // KGM / INP / ING
  planName            String?  // SHEM-TOCHNIT
  policyOrAccountNumber String?  // MISPAR-POLISA-O-HESHBON
  unifiedProductCode  String?  // KIDOD-ACHID (30-digit consolidated code)

  statusCode          String?  // STATUS-POLISA-O-CHESHBON raw
  statusLabel         String?  // resolved Hebrew label
  isActive            Boolean  @default(false)

  joinDate            DateTime?    // TAARICH-HITZTARFUT-MUTZAR
  firstJoinDate       DateTime?    // TAARICH-HITZTARFUT-RISHON
  lastUpdatedDate     DateTime?    // TAARICH-IDKUN-STATUS
  valuationDate       DateTime?    // TAARICH-NECHONUT

  hasLoan             Boolean  @default(false)   // YESH-HALVAA-BAMUTZAR
  hasArrears          Boolean  @default(false)   // KAYAM-CHOV-O-PIGUR
  hasExternalCoverage Boolean  @default(false)   // KAYAM-KISUY-HIZONI
  hasBeneficiaries    Boolean  @default(false)
  hasAttorney         Boolean  @default(false)   // KAYAM-MEYUPE-KOACH

  employerName        String?      // SHEM-MAASIK
  employerCode        String?      // MPR-MAASIK-BE-YATZRAN

  rawImportantFieldsJson Json?     // sanitized snapshot of high-value fields the matcher might want

  // Deterministic identity for idempotent upsert. Never null. SHA-256 of:
  //   customerId | providerCode | policyOrAccountNumber | productTypeCode | unifiedProductCode | sourceRecordPath
  // This avoids PostgreSQL's "multiple nulls allowed" issue with composite unique keys.
  sourceStableKey     String   @unique

  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  balances            CustomerBalanceSnapshot[]

  @@index([customerId])
  @@index([providerId])
  @@index([source])
  @@index([productTypeCode])
  @@index([importJobId])
}
```

Notes:
- `rawImportantFieldsJson` is a sanitized subset — never raw XML, never PII beyond what's already in canonical fields. Used as a debugging aid and a way for new propensity rules to read fields we didn't promote to columns.
- `sourceStableKey` is the single unique constraint. Computed deterministically from `customerId + providerCode + policyOrAccountNumber + productTypeCode + unifiedProductCode + sourceRecordPath`, hashed with SHA-256. Never null. Re-importing the same product produces the same key → idempotent upsert. The composite alternative (`@@unique([customerId, providerId, policyOrAccountNumber])`) was rejected because PostgreSQL allows multiple rows with NULL in the unique columns, which would silently create duplicates when account numbers are missing.

### 3.4 New table — `CustomerBalanceSnapshot`

Time-series of pension / provident balances. A product can have multiple balances on the same date (one per investment track from `PerutMasluleiHashkaa`, plus a product-total roll-up, plus separate redemption-value entries from `BlockItrot/Yitrot`). The unique key reflects this.

```prisma
model CustomerBalanceSnapshot {
  id                       String   @id @default(uuid())
  productId                String
  product                  CustomerFinancialProduct @relation(fields: [productId], references: [id], onDelete: Cascade)
  importJobId              String?
  importJob                ImportJob? @relation(fields: [importJobId], references: [id])
  snapshotDate             DateTime    // TAARICH-NECHONUT or TAARICH-ERECH-TZVIROT

  // Discriminators — together with productId+date these make the row unique.
  snapshotKind             String      // "TRACK_BALANCE" | "PRODUCT_TOTAL" | "REDEMPTION" | "BLOCK"
  trackCode                String?     // KOD-MASLUL-HASHKAA when applicable; null for product-wide rows
  trackName                String?     // SHEM-MASLUL-HASHKAA

  balanceAmount            Decimal?    // SCHUM-TZVIRA-BAMASLUL
  redemptionAmount         Decimal?    // values from BlockItrot / Yitrot
  monthlyContribution      Decimal?    // SCHUM-HAFRASHA when frequency is monthly
  employeeContribution     Decimal?    // SUG-HAFRASHA = 8
  employerContribution     Decimal?    // SUG-HAFRASHA = 9
  compensationComponent    Decimal?    // pizoy (SHELISHI fund component)
  ytdReturn                Decimal?    // TSUA-NETO-METZUVERET-MITCHILAT-SHANA

  rawJson                  Json?       // sanitized

  createdAt                DateTime @default(now())

  // Unique on (product, date, kind, track) — collapsing multi-track snapshots
  // would lose the per-track detail Misleka explicitly provides.
  // trackCode is nullable; the unique index treats NULL as a distinct value
  // (PostgreSQL default), which is correct here because at most one
  // (productId, date, kind, NULL) row exists per product (the roll-up).
  @@unique([productId, snapshotDate, snapshotKind, trackCode])
  @@index([productId, snapshotDate(sort: Desc)])
}
```

### 3.5 Customer extension — consent and 360 metadata

```prisma
model Customer {
  // ... existing fields ...
  // Consent for storing third-party financial data (Misleka, banking)
  externalDataConsentAt    DateTime?
  externalDataConsentScope String?      // "MISLEKA" | "FULL_360" | etc.
  externalDataConsentRef   String?      // optional reference to a signed document
  // Computed snapshot for performance — refreshed on import
  contextComputedAt        DateTime?
  contextCompletenessScore Int?         // 0=BAFI only, 1=+Har HaBituach, 2=+Misleka, 3=+banking
}
```

### 3.6 What we are explicitly NOT adding now

- `CustomerEmployer` table — wait until sample data shows multi-employer-per-product complexity
- `CustomerBeneficiary` table — `hasBeneficiaries` boolean is enough until sample data shows usable structured beneficiary records
- `CustomerBankAccount`, `CustomerLoan`, `CustomerCreditCard` tables — wait until banking files arrive; format determines shape
- `CustomerVehicle`, `CustomerProperty` — already implicit via `Policy` for now
- Provider-specific adapter classes — one generic parser only

---

## 4. Parser / import pipeline

### 4.1 Module structure

Mirror the existing `har-habituach/` directory.

```
src/lib/import/misleka/
  parse-xml.ts         # safe XML → DOM with XXE/DTD off, size cap, depth cap
  detect-metadata.ts   # extract KoteretKovetz fields and provider classification
  code-maps.ts         # SUG-MUTZAR / status / gender / etc. → Hebrew labels
  columns.ts           # field-finder utilities: tolerantly read tags by name
  normalizer.ts        # raw fields → normalized record types
  customer-extractor.ts # customer identity from the file
  product-extractor.ts  # products + balances + employers
  matcher.ts           # match to existing Customer by national ID, with confidence
  merger.ts            # group records across files for same customer
  persister.ts         # idempotent upsert into CustomerFinancialProduct + snapshots
  pipeline.ts          # orchestrator
  errors.ts            # MislekaParseError with safe Hebrew messages
```

### 4.2 Security controls (parser)

| Control | Implementation |
|---------|----------------|
| External entity expansion | `noent: false`, no DTD processing |
| DTD processing | disabled at parser level |
| File size cap | 10 MB hard limit, 25 MB soft warning |
| Element nesting depth | cap at 50 |
| File extension validation | `.xml` only |
| MIME type validation | `application/xml`, `text/xml`, or absent |
| Encoding | Detect declared encoding from XML prolog; UTF-8 + Windows-1255 supported; reject only when undeclared and undetectable |
| Raw content logging | never log XML bytes; only file hash + size + name + warnings |

Encoding detection logic:

1. Read first 1024 bytes, parse XML prolog `<?xml version="…" encoding="…" ?>`
2. If declared encoding is UTF-8 or Windows-1255, decode with that
3. If undeclared, attempt UTF-8 first; on failure fall back to Windows-1255
4. If both fail, reject with Hebrew error: "קידוד הקובץ אינו נתמך — נדרש UTF-8 או Windows-1255"
5. Record detected encoding in `ImportJob.metadataJson.files[].encoding`

All 8 sample files are UTF-8 with explicit declaration. Windows-1255 support is defensive — older BAFI exports use it, and some institutional providers historically did too.

We use `fast-xml-parser` (no DTD support, safe by default) instead of native DOM parsing. The parser is wrapped in a controlled sandbox function.

### 4.3 Tolerant field finder

```typescript
function findField(node, tagName): string | null {
  // Walks namespaces, treats xsi:nil="true" as null,
  // treats whitespace-only and "NULLNULL" as null,
  // unwraps p2: / p3: / p4: prefix variations,
  // returns trimmed string content
}
```

Found-in-files variations to handle:
- `xsi:nil="true"` and `pN:nil="true"` for any N
- Empty strings vs absent fields (treat both as null)
- Numeric strings with leading zeros (preserve when ID, normalize when count)
- Date formats: YYYYMMDD, YYYYMMDDHHmmss, YYYY-MM-DD, YYYYMM
- Phone numbers as `"NULLNULL"` literal
- Padded plan names (right-padded to fixed width with spaces)

### 4.4 Pipeline flow

```
parseXml(file)
  → detectMetadata(root)         // KoteretKovetz fields
  → checkSupport(metadata)       // provider known? version supported?
  → extractCustomer(root)        // YeshutLakoach fields, normalize national ID
  → extractProvider(metadata)    // upsert InstitutionalProvider
  → extractProducts(root)        // Mutzarim → array of normalized products
  → extractBalances(root)        // PerutMasluleiHashkaa → snapshots
  → matchOrCreateCustomer()      // existing? confidence? manual review?
  → persistImport()              // upsert products + snapshots; link to ImportJob
  → enrichCustomerContext()      // recompute Customer.contextComputedAt
  → generateMislekaInsights()    // 3–5 cautious insights
  → return importReport()
```

Multi-file uploads are supported: same customer's 8 files are processed as a batch under one `ImportJob` (one job per upload event, even with multiple files).

### 4.5 Code-map module

Extract every coded field and Hebrew label into a single source of truth:

```typescript
export const PRODUCT_TYPE_LABELS: Record<string, string> = {
  "1": "ביטוח חיים",
  "2": "השתלמות / חיסכון",
  "3": "פנסיה",
  "4": "השתלמות",
  "5": "פנסיה מקיפה",
  "6": "ביטוח חיים מקובץ",
};

export const STATUS_LABELS: Record<string, string> = {
  "1": "פעיל",
  "2": "סגור / שונה",
  "3": "מצבור בלבד",
  "4": "דחוי",
  "5": "תלוי",
};

// ... gender, marital status, identifier type, contribution type, payment frequency, etc.

export function resolveLabel(map, code): { label: string; isKnown: boolean } {
  if (code == null) return { label: "—", isKnown: false };
  const known = map[code];
  if (known) return { label: known, isKnown: true };
  return { label: `קוד לא מזוהה (${code})`, isKnown: false };
}
```

Unknown codes generate warnings on the import report.

### 4.6 No provider adapters in v1

The 8 sample files share the מבנה אחיד skeleton. Quirks (xsi:nil prefixes, "NULLNULL" phones, padded plan names, inline comments in Clal) are handled at the tolerant field-finder layer. We don't sketch `MeitavAdapter`, `HarelAdapter`, etc. Adapters earn their keep only when a real provider deviates beyond what tolerant parsing handles. If Phase 1 reveals deviation, the design is extensible: an adapter is just an object exposing `extractCustomer / extractProducts / etc.` overrides.

### 4.7 Upload route

`POST /api/import/misleka/upload`

- `multipart/form-data` with one or many `file` parts
- Auth: `requireAuth + requireRole(["OWNER", "MANAGER", "OPERATIONS", "ADMIN"])`
- Validation: file size, extension, MIME, count cap (≤ 20 files per upload)
- Per-operator in-flight lock (mirrors Har HaBituach)
- Returns the `ImportJob.id` so client can poll for status
- Audit: `misleka_import_started` / `misleka_import_completed` / `misleka_import_failed`

**Required form fields beyond the files:**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `customerId` | UUID | Required when uploading via the customer profile page; optional in admin bulk flow (then matching is the only link path) |
| `consentSource` | enum | Yes | `CUSTOMER_VERBAL` / `CUSTOMER_SIGNED` / `AGENT_REPRESENTED` / `DEMO_INTERNAL` |
| `consentScope` | enum | Yes | `MISLEKA_PRODUCTS` / `FULL_360` / `DEMO_INTERNAL` |
| `consentDate` | ISO date | Yes | When consent was recorded; ≤ today |
| `consentDocRef` | string | Optional | URL or storage reference to a signed consent document |
| `bypassConsent` | boolean | Optional | Only OWNER role; only when `consentScope = DEMO_INTERNAL`; logs a separate `misleka_import_bypassed_consent` audit event |

**Consent enforcement rules:**
- The route rejects with 400 + Hebrew error when consent fields are missing for a real customer import.
- `DEMO_INTERNAL` scope is allowed only when `bypassConsent = true` AND role = OWNER. Used for the Max Segal sample data and similar test/demo flows.
- Every import — including demo — records the consent fields on the `ImportJob` row. There is no path that imports without a recorded consent decision.

Hebrew error message when consent missing:

> "חסר אישור הסכמה לאחסון נתונים פיננסיים — יש לציין מקור הסכמה, היקף, ותאריך."

Client UI: drag-and-drop zone, list of files, consent capture form (radio for source, dropdown for scope, date picker, optional doc reference), progress bar via polling `GET /api/import/job/{id}`.

---

## 5. Customer matching and import review

### 5.1 National ID normalization

```typescript
function normalizeIsraeliId(raw: string | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 0) return null;
  return digits.padStart(9, "0");        // canonical 9-digit form
}
```

All customer matching uses normalized form. Existing `Customer.israeliId` may need backfill — we'll detect and fix during the migration.

### 5.2 Match confidence

| Confidence | Conditions | Action |
|-----------|-----------|--------|
| `HIGH` | Exact normalized national ID match on existing `Customer` | Auto-link |
| `MEDIUM` | National ID match but email or phone in XML differs from `Customer` record | Auto-link, flag in import report ("contact data differs") |
| `LOW` | No national ID match, but full name + DOB matches an existing customer | **Hold** for manual review, do not link |
| `NONE` | No match | Create new `Customer` with `source = "MISLEKA_ONLY"` flag, like the Har HaBituach prospect pattern |

Manual review surface: a section in the import report titled "התאמות לבדיקה ידנית" listing each LOW match with a one-click "אשר התאמה" or "צור לקוח חדש" button.

**`Customer.source` semantics — full set:**

| Value | Meaning |
|-------|---------|
| `OFFICE` | Customer is an active client of the agency (BAFI data is authoritative) |
| `HAR_HABITUACH_ONLY` | Prospect surfaced via Har HaBituach external data; not yet a client |
| `MISLEKA_ONLY` | Prospect surfaced via Misleka XML; not yet a client |

Adding `MISLEKA_ONLY` requires updates beyond the schema:
- `src/lib/constants.ts`: extend `customerSourceLabels` with the new value
- `/customers` list page: filter chips and badges include the new value
- Customer profile header: banner copy adapts (e.g. "לקוח שזוהה דרך מסלקה — לא נמצא בתיקי המשרד")
- Queue / insight UX: new prospects from Misleka can fire the "outside-the-office" cross-sell rule the same way Har HaBituach prospects already do

### 5.3 Import report

Returned from the pipeline and persisted on `ImportJob`:

```typescript
{
  fileCount: number;
  filesProcessed: { fileName, providerCode, providerName, productCount, warnings }[];
  matchedCustomers: number;
  newCustomers: number;
  manualReviewQueue: { fileName, customerCandidate, confidence }[];
  productsCreated: number;
  productsUpdated: number;
  balanceSnapshotsCreated: number;
  warnings: { code, message, fileName?, productPath? }[];
  errors: { code, message, fileName? }[];
  durationMs: number;
}
```

UI presents this as a clean post-import summary screen, with expandable sections per file.

---

## 6. Customer 360 UX

### 6.1 Layout

The page evolves the existing customer detail view rather than replacing it. Sections, not tabs (matches the prism-glass aesthetic and progressive-disclosure pattern already in place).

```
┌─ Data Coverage Banner (existing)
│
├─ Customer header (existing) — name, tenure chip, ID, address, phone
│
├─ Executive Intelligence Panel  ← NEW, top of page
│  Four glass cards:
│    מה אנחנו יודעים    מה חסר    מה השתנה    מה ההזדמנות
│  Each card shows a short summary + a count + a click-through.
│
├─ Insurance Map (existing) — 7-category grid with neon-ring shields
│
├─ Two-column main grid (existing 2/3 + 1/3)
│  Left:
│    Insights (existing, with new "מקור" badge per insight)
│    Customer Notes (existing)
│    Message Drafts (existing)
│  Right:
│    Policies card (existing)
│    Customer Journey card (existing)
│
├─ פנסיה, גמל והשתלמות      ← NEW
│  Per-product cards: provider, plan name, status, balance, joinDate, source badge
│  Expandable: balance history (snapshots), employer linkage, contribution rate
│
├─ מסמכים וייבוא            ← NEW
│  Timeline of all imports for this customer:
│    BAFI / Har HaBituach / Misleka, with file count, freshness, source badge
│
├─ מידע בנקאי               ← NEW (placeholder, real-but-empty)
│  Empty state copy:
│    "בעתיד יוצגו כאן נתוני עו״ש, הלוואות, התחייבויות ותזרים — בכפוף להרשאות
│     ולחיבור מקור מידע בנקאי."
│  Hidden by default if user role doesn't see banking data; otherwise rendered as
│  a gray placeholder card. Clicking "הוסף מקור בנקאי" opens a future flow.
```

### 6.2 Executive Intelligence Panel — content rules

Each card shows a one-line summary + a counter + an expand:

| Card | What it answers |
|------|----------------|
| מה אנחנו יודעים | Number of products across providers, freshness, completeness score |
| מה חסר | Coverage gaps, missing balance data, stale records, no recent contact |
| מה השתנה | Last 30 days: new products, status changes, expirations approaching |
| מה ההזדמנות | Top scoring insight, dollar value when available, count of strong opportunities |

Generated from `CustomerContext` — not stored, recomputed on render.

### 6.3 Source badges

Every fact the agent reads carries a small chip showing where it came from. Reuse the existing badge component with new variants:

| Source | Variant | Hebrew label |
|--------|---------|--------------|
| Agency BAFI data | primary (violet) | משרד |
| Har HaBituach external | violet (existing 📂) | הר הביטוח |
| Misleka XML | indigo | מסלקה |
| Manual / agent input | amber | ידני |
| Banking (future) | cyan | בנקאות |

Tooltip on hover: which import job, when it landed.

### 6.4 פנסיה, גמל והשתלמות section

Card per product, grouped by provider. Each card shows:

- Provider name + logo placeholder
- Plan name + product type label (resolved from code map)
- Status (Hebrew label)
- Join date / first join date
- Current balance (if snapshot exists) with valuation date
- Monthly contribution if known
- Employer linkage badge if applicable
- Source badge ("מסלקה")
- Expand: balance snapshot history (small line chart later; tabular for now)

Empty state: "אין מוצרים מוסדיים שיובאו עבור לקוח זה. ניתן להעלות קבצי מסלקה."

### 6.5 No tabs

The single-scroll layout with sticky section anchors fits the existing aesthetic. Tabs would fragment information that the agent benefits from seeing together. The page can grow long; a section nav on the right edge (sticky) lets the agent jump.

---

## 7. CustomerContext and propensity rules

### 7.1 CustomerContext shape

A derived read-model. Computed lazily during insight generation. Not a table on day one — but the structure is stable enough to materialize later if performance demands.

```typescript
interface CustomerContext extends CustomerProfile {
  // Existing CustomerProfile fields stay unchanged.

  // External data integration
  harHabituachPolicies: Policy[];                 // all external policies
  harHabituachActivePolicies: Policy[];           // status-filtered

  // Misleka institutional products
  financialProducts: CustomerFinancialProduct[];
  pensionBalanceTotal: number | null;             // sum across pension products
  providentBalanceTotal: number | null;
  educationFundBalanceTotal: number | null;
  monthlyContributionEstimate: number | null;

  // Cross-source aggregates
  totalAccumulatedSavingsAllSources: number;      // BAFI policies + Misleka products
  providersCount: number;                         // distinct providers across sources
  hasExternalProducts: boolean;
  hasInstitutionalProducts: boolean;

  // Quality signals
  contextCompletenessScore: 0 | 1 | 2 | 3;        // 0=BAFI only, 1=+HaR, 2=+Misleka, 3=+banking
  contextStaleness: { source: string; ageDays: number }[];

  // Notes & activity
  notes: CustomerNote[];

  // Banking signals — empty in Phase 1, populated in Phase 4
  bankingSignals: {
    estimatedMonthlyIncome: number | null;
    hasMortgage: boolean | null;
    hasCarLoan: boolean | null;
    debtLoad: number | null;
    cashflowRisk: "stable" | "tight" | "at-risk" | null;
  };

  contextComputedAt: Date;
}
```

### 7.2 New rule clauses

Added to the matcher; existing clauses unchanged.

| New clause | Semantics |
|-----------|-----------|
| `pension_balance` | Sum of balanceAmount across active pension products |
| `provident_balance` | Sum across provident products |
| `total_savings_all_sources` | totalAccumulatedSavingsAllSources |
| `providers_count` | Distinct providers across BAFI + Misleka |
| `has_institutional_products` | True if any CustomerFinancialProduct exists |
| `institutional_products_count` | Total CustomerFinancialProduct count |
| `monthly_contribution_estimate` | Estimated total monthly inflow |
| `pension_product_age_years` | Oldest CustomerFinancialProduct of pension type |
| `has_employer_linked_product` | True if any product has employerCode |
| `data_completeness_score` | 0–3 |

Banking clauses are scaffolded with consistent names (`estimated_monthly_income`, `has_mortgage`, `has_car_loan`, `debt_load`, `cashflow_risk`) so rules can be authored before data lands. Until data populates, these clauses always fail.

### 7.3 Initial 8 propensity rules (proposed)

Each rule below is a draft of `OfficeRule` rows to seed. Final phrasing reviewed with Rafi before insert.

| # | Hebrew title | triggerCondition | kind | base |
|---|-------------|------------------|------|------|
| 1 | תיק פנסיה מבוזר | `providers_count >= 3 AND has_institutional_products` | commercial | 80 |
| 2 | מוצר גמל ותיק שלא נסקר | `pension_product_age_years > 10 AND months_since_review > 12` | commercial | 75 |
| 3 | חיסכון משמעותי, חיים חסר | `total_savings_all_sources > 200000 AND no_policy_category = LIFE` | commercial | 90 |
| 4 | פנסיה ברירת מחדל ולא נבדקה | `has_institutional_products AND months_since_review > 18 AND pension_product_age_years < 3` | service_tip | 60 |
| 5 | מוצר עם נתון יתרה חסר | `has_institutional_products AND data_completeness_score < 2` | service_tip | 55 |
| 6 | קצבה בלבד — בלי הגנה אישית | `has_institutional_products AND no_policy_category = LIFE AND no_policy_category = HEALTH` | commercial | 85 |
| 7 | מעסיק מלווה — בדוק הפקדות | `has_employer_linked_product AND months_since_review > 12` | service_tip | 60 |
| 8 | יותר מספק אחד באותה קטגוריה | `institutional_products_count > 1 AND providers_count > 1` | commercial | 78 |

Rules 1–8 are seeded via a script (`scripts/seed-misleka-rules.mjs`), versioned, idempotent.

### 7.4 Computation timing — batch by design

`enrichCustomerProfilesWithContext(customerIds: string[])` is a **batch** operation. For a batch of N customers, total queries = 4 (not 4×N):

1. One query for all `CustomerFinancialProduct` rows where `customerId IN (...)`
2. One query for latest `CustomerBalanceSnapshot` per product, scoped by the same customer set
3. One query for Har HaBituach policies (`Policy WHERE customerId IN (...) AND externalSource = 'HAR_HABITUACH'`)
4. One query for `CustomerNote`s scoped to the customer set

The function returns `Map<customerId, CustomerContext>`. The `/api/insights/generate` route already loads customers in pages of 200; the context loader scales linearly with **page count**, not customer count.

Caller pattern:

```typescript
const customerBatch = await fetchCustomersPage(offset, limit);
const profileBatch = customerBatch.map(buildProfile);
const contextMap = await enrichCustomerProfilesWithContext(
  customerBatch.map(c => c.id)
);
for (const profile of profileBatch) {
  const context = contextMap.get(profile.customer.id) ?? emptyContext();
  evaluateRules(profile, context);
}
```

Per-customer enrichment is explicitly **not** the API. Future call sites (e.g. the customer detail API loading a single customer) call the batch function with a one-element array — the cost is identical to a hand-rolled single fetch and the code path is unified.

Phase 4 may materialize `CustomerContext` into a denormalized table if banking integration multiplies query cost. For now, batched lazy compute is correct.

---

## 8. Security, privacy, audit

### 8.1 Threat model

Sensitive data in scope:
- National IDs
- Names, DOBs, addresses, phones, emails
- Pension and provident balances
- Employer details
- Beneficiaries (when surfaced)
- Future banking data: income, mortgages, loans, cashflow

Threats we design against:
- XML parser attacks (XXE, billion laughs)
- Raw XML leakage in logs
- Unauthorized access to financial data via API
- Exfiltration via the AI flow (sending PII to Anthropic)
- Tampering during import
- Replay of stale imports

### 8.2 Controls

| Control | Implementation |
|---------|----------------|
| Parser hardening | XXE off, DTD off, no entity expansion, depth + size caps |
| Role gating | See role matrix below |
| Audit logging | See audit-event matrix below |
| PII masking in UI | National IDs displayed with last-3-digit reveal toggle for OWNER only |
| AI sanitization | The existing `sanitize.ts` extends to strip names, IDs, account numbers, balances before any LLM call |
| Encryption at rest | Supabase already encrypts at rest; we don't store raw XML files |
| File hash for traceability | SHA-256 stored per file in `ImportJob.metadataJson.files[].fileHash` |
| Consent fields | `Customer.externalDataConsent*` populated at import time |
| Right to erasure | Per-import rollback + per-customer financial-data wipe (see §9) |

### 8.3 What never gets logged

- Raw XML bytes
- National IDs in plaintext in logs (only hashed reference)
- Phone, email, address values
- Balances, contribution amounts, account numbers
- Beneficiary names

Error logs include: `ImportJob.id`, file hash, file index, line number (for XML errors), error code class (e.g. "PARSE_ERROR", "MATCH_AMBIGUOUS"). No values.

### 8.4 Role matrix

| Role | View 360 | View financial data (pension/banking) | Import Misleka | Delete imports | Bypass consent (demo) |
|------|----------|---------------------------------------|----------------|----------------|-----------------------|
| AGENT | Assigned customers only | Assigned customers only | No | No | No |
| OPERATIONS | All customers | All customers | Yes | No | No |
| MANAGER | All customers | All customers | Yes | Yes | No |
| ADMIN | All customers | All customers | Yes | Yes | No |
| OWNER | All customers | All customers | Yes | Yes | Yes (DEMO_INTERNAL only) |

"Assigned customers" for AGENT means customers in their queue + customers explicitly assigned via `Customer.assignedManagerId`. The 360 API already supports this scoping for other endpoints; we extend it to financial data.

### 8.5 Audit event matrix

Goal: every meaningful action on sensitive data is logged, but page-render trails don't flood the audit table.

| Event | When fired | Rate limit |
|-------|-----------|-----------|
| `misleka_import_started` | Upload accepted, ImportJob created | Per upload |
| `misleka_import_completed` | Pipeline finished successfully | Per upload |
| `misleka_import_failed` | Pipeline aborted | Per upload |
| `misleka_import_partial` | Pipeline finished with errors | Per upload |
| `misleka_import_bypassed_consent` | OWNER used `bypassConsent` | Per upload |
| `misleka_customer_matched` | Customer linked to import | Per match (with confidence + customerId) |
| `misleka_import_deleted` | Per-import rollback | Per delete |
| `customer_financial_data_deleted` | Per-customer right-to-erasure | Per delete |
| `customer_financial_section_expanded` | Operator expanded a sensitive section (pension card, balance history, beneficiaries) | Once per (operator, customer, section, calendar day) |
| `customer_360_session` | Daily aggregate of which operator viewed which customer's 360 | Once per (operator, customer, calendar day) |

The previous draft logged a `customer_360_view` event on every page render. Dropped — that's noise. The two replacement events capture the same intent (who looked at what) without volume issues.

---

## 9. Rollback and deletion

### 9.1 Per-import rollback

Every `CustomerFinancialProduct` and `CustomerBalanceSnapshot` carries `importJobId`. Deleting an import means:

```sql
BEGIN;
  DELETE FROM customer_balance_snapshots WHERE "importJobId" = $1;
  DELETE FROM customer_financial_products WHERE "importJobId" = $1;
  UPDATE import_jobs
    SET "deletedAt" = NOW(), "deletedBy" = $2
    WHERE id = $1;
  -- Audit log: misleka_import_deleted with operatorEmail, importJobId, counts
COMMIT;
```

The `ImportStatus` enum is **not** extended with a `DELETED` value — that would conflate "the import job ran successfully" with "we later deleted its data". Instead, deletion is a soft marker (`deletedAt` + `deletedBy`) on top of the existing terminal status. Listing endpoints filter `WHERE "deletedAt" IS NULL` by default; a "deleted imports" view shows them when an operator audits past activity.

Customers created exclusively from a deleted import (no other linkage) are *not* auto-deleted — deletion of customers is a separate, more deliberate flow (see §9.2). The orphan flag is exposed in the UI so an operator can review.

### 9.2 Right to erasure (per-customer)

A separate operator action: "מחק נתוני 360 חיצוניים של הלקוח".

Effect:
- Delete all `CustomerFinancialProduct` for that customer
- Delete all `CustomerBalanceSnapshot` for those products (cascade)
- Delete relevant Har HaBituach policies (`externalSource = 'HAR_HABITUACH'`)
- Clear `externalDataConsent*` fields
- Log audit event with operator + customer ID + scope

Office BAFI data is *not* deleted by this action. Full customer deletion is a different, owner-only flow.

### 9.3 Soft delete vs hard delete

For Phase 1: hard delete. Simpler to implement and matches GDPR-style intent.

For Phase 2+, if regulatory or analytics needs require soft delete, we add a `deletedAt` timestamp on the relevant tables and update queries. Not in scope now.

---

## 10. Acceptance criteria — first milestone

The first milestone is done when:

- ☐ `/api/import/misleka/upload` accepts the 8 Max Segal XMLs in one upload
- ☐ Parser detects all 5 providers correctly
- ☐ Parser handles xsi:nil, padded plan names, "NULLNULL" phones, dynamic namespace prefixes without crashing
- ☐ Customer matching links all 8 files to Max Segal at HIGH confidence (national ID match, normalized)
- ☐ All institutional products land as `CustomerFinancialProduct` rows linked to him
- ☐ Balance snapshots populate where data exists (Altshuler files have ~₪94K/₪95K balances)
- ☐ Provider rows seeded in `InstitutionalProvider`
- ☐ Customer 360 page renders the new "פנסיה, גמל והשתלמות" section with 8 products grouped by provider
- ☐ Source badges visible on every relevant fact
- ☐ Executive Intelligence Panel renders with four cards populated from `CustomerContext`
- ☐ Banking placeholder section renders with the placeholder copy
- ☐ At least 3 propensity insights fire from the 8 seeded rules
- ☐ Import report surfaces warnings for unknown codes / missing fields
- ☐ Audit log shows the import + customer match + 360 view events
- ☐ Build passes with no TypeScript errors
- ☐ Production deployment succeeds and the demo customer is viewable in the live app

---

## 11. Phasing and timeline

Each phase commits to its own scope. Estimates are working-day budgets (focused work; calendar time depends on availability).

### Phase 1 — Misleka import + data model (~10 working days)

- Prisma schema diff + migration (~1 day)
- `InstitutionalProvider` seed (~half day)
- Parser modules + XXE/DTD hardening + tests (~3 days)
- Customer matching + import report (~1 day)
- Upload route + audit + role gating (~1 day)
- Client-side import UI (~1 day)
- Persistence + idempotent upsert + rollback delete (~1.5 days)
- E2E test against Max Segal sample (~1 day)

### Phase 2 — Customer 360 facelift (~10 working days)

- Executive Intelligence Panel (~2 days)
- "פנסיה, גמל והשתלמות" section (~2 days)
- "מסמכים וייבוא" timeline (~1 day)
- Banking placeholder section (~half day)
- Source-badge rollout across all sections (~1 day)
- API extension to feed the new sections (~1 day)
- Visual polish + responsive (~1.5 days)
- Permission + masking refinement (~1 day)

### Phase 3 — CustomerContext + propensity rules (~10 working days)

- `CustomerContext` builder (lazy compute) (~2 days)
- New matcher clauses (~2 days)
- 8 propensity rules seeded + tested (~2 days)
- Score breakdown extension for new clauses (~1 day)
- E2E rule firing across the demo dataset (~1 day)
- Refinement + documentation (~2 days)

### Phase 4 — Banking integration (later, ~10–15 working days when source is decided)

Not started until source is known. Pre-built scaffolding (placeholder UI, banking signal slots in `CustomerContext`, banking source label in source-badge system, banking enum kinds in `ImportKind`) means the plug-in is faster.

**Total Phase 1+2+3**: ~30 working days. Realistic 6 calendar weeks at full focus.

---

## 12. Explicitly NOT doing yet

This list is the line that prevents scope creep mid-implementation.

| Item | Why deferred |
|------|--------------|
| `CustomerEmployer` table | Sample data shows employer info per-product, not per-customer. Wait until multi-employer-per-customer use case appears |
| `CustomerBeneficiary` table | Sample files have empty NetuneiSheerim across the board. Boolean `hasBeneficiaries` is enough until structured data exists |
| Provider-specific adapter classes | Current sample handled by tolerant generic parser. Build only when a real deviation forces it |
| Banking account / loan / credit-card tables | Format unknown until banking files arrive. Premature design = guaranteed rework |
| AI-driven propensity scoring | Rule engine first. ML later, only if rules can't capture the patterns |
| Multi-customer batch upload | Single-customer-per-upload (multi-file is fine). Bulk import for prospect lists is a separate flow |
| Document storage in DB | We hash + reference. Raw files stay outside the DB; only tested cases ever go to Supabase storage with explicit encryption |
| Per-product balance time-series beyond what Misleka provides | We store snapshots when files include them. We don't synthesize daily values |
| Currency conversion / multi-currency support | Israeli context, ILS only |
| Multi-language UI | Hebrew RTL only |
| Public-facing customer portal | Agent-led upload only in Phase 1. Self-service later |
| Real-time pension API integration | Misleka files are point-in-time. Live API integrations are out of scope |
| Cross-customer analytics / cohort views | Per-customer is the unit for now |
| Insight versioning (audit-trail of insight changes) | The recent regen patterns work for now |

---

## 13. Open questions

1. Final consent copy text for the consent flow at import time (legal review needed before production)
2. Whether to soft-delete or hard-delete by default at the per-import level (current plan: hard)
3. Banking source decision (Open Banking vs uploaded statements vs questionnaire) — decides Phase 4 design
4. Manual review queue UX details — table or per-record cards?
5. Retention policy for `CustomerBalanceSnapshot` — keep all? Roll up older than 24 months?

These don't block Phase 1. They block production rollout to real customers.

---

## 14. References

- XML structure analysis: `/tmp/misleka-xml-analysis.md` (full per-tag inventory)
- Existing import pipeline: see existing code at `src/lib/import/{parse-csv,har-habituach}/`
- Customer page: `src/app/(dashboard)/customers/[id]/page.tsx`
- Rule matcher: `src/lib/insights/rule-matcher.ts`
- Sample data: `/Users/gillavon/Desktop/mislaka-samples/max-segal/` (8 files, 5 providers)

---

*End of design doc. Reviewer should annotate inline; we'll iterate before code.*
