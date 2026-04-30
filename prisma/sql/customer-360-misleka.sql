-- Customer 360 + Misleka XML — Phase 1 schema additions.
-- Idempotent: each statement uses IF NOT EXISTS or guards.

-- ============================================================
-- 1. ImportKind enum
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ImportKind') THEN
    CREATE TYPE "ImportKind" AS ENUM (
      'BAFI_LIFE',
      'BAFI_ELEMENTARY',
      'HAR_HABITUACH',
      'MISLEKA_XML',
      'BANKING_STATEMENT',
      'BANKING_OPEN_API'
    );
  END IF;
END $$;

-- ============================================================
-- 2. Extend ImportJob
-- ============================================================

ALTER TABLE "import_jobs"
  ADD COLUMN IF NOT EXISTS "kind"              "ImportKind",
  ADD COLUMN IF NOT EXISTS "metadataJson"      JSONB,
  ADD COLUMN IF NOT EXISTS "warnings"          JSONB,
  ADD COLUMN IF NOT EXISTS "consentSource"     TEXT,
  ADD COLUMN IF NOT EXISTS "consentScope"      TEXT,
  ADD COLUMN IF NOT EXISTS "consentDate"       TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "consentRecordedBy" TEXT,
  ADD COLUMN IF NOT EXISTS "consentDocRef"     TEXT,
  ADD COLUMN IF NOT EXISTS "deletedAt"         TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "deletedBy"         TEXT;

CREATE INDEX IF NOT EXISTS "import_jobs_kind_idx"      ON "import_jobs" ("kind");
CREATE INDEX IF NOT EXISTS "import_jobs_deletedAt_idx" ON "import_jobs" ("deletedAt");

-- ============================================================
-- 3. Extend Customer with consent + context fields
-- ============================================================

ALTER TABLE "customers"
  ADD COLUMN IF NOT EXISTS "externalDataConsentAt"    TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "externalDataConsentScope" TEXT,
  ADD COLUMN IF NOT EXISTS "externalDataConsentRef"   TEXT,
  ADD COLUMN IF NOT EXISTS "contextComputedAt"        TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "contextCompletenessScore" INT;

-- ============================================================
-- 4. InstitutionalProvider
-- ============================================================

CREATE TABLE IF NOT EXISTS "institutional_providers" (
  "id"            TEXT        PRIMARY KEY,
  "providerCode"  TEXT        NOT NULL UNIQUE,
  "providerName"  TEXT        NOT NULL,
  "shortName"     TEXT,
  "category"      TEXT        NOT NULL,
  "contactPerson" TEXT,
  "phone"         TEXT,
  "email"         TEXT,
  "address"       TEXT,
  "isActive"      BOOLEAN     NOT NULL DEFAULT TRUE,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL
);

CREATE INDEX IF NOT EXISTS "institutional_providers_category_idx"
  ON "institutional_providers" ("category");

-- ============================================================
-- 5. CustomerFinancialProduct
-- ============================================================

CREATE TABLE IF NOT EXISTS "customer_financial_products" (
  "id"                     TEXT        PRIMARY KEY,
  "customerId"             TEXT        NOT NULL,
  "providerId"             TEXT,
  "importJobId"            TEXT,
  "source"                 TEXT        NOT NULL,
  "sourceFileName"         TEXT,
  "sourceRecordPath"       TEXT,
  "productTypeCode"        TEXT        NOT NULL,
  "productTypeLabel"       TEXT,
  "interfaceType"          TEXT,
  "planName"               TEXT,
  "policyOrAccountNumber"  TEXT,
  "unifiedProductCode"     TEXT,
  "statusCode"             TEXT,
  "statusLabel"            TEXT,
  "isActive"               BOOLEAN     NOT NULL DEFAULT FALSE,
  "joinDate"               TIMESTAMP(3),
  "firstJoinDate"          TIMESTAMP(3),
  "lastUpdatedDate"        TIMESTAMP(3),
  "valuationDate"          TIMESTAMP(3),
  "hasLoan"                BOOLEAN     NOT NULL DEFAULT FALSE,
  "hasArrears"             BOOLEAN     NOT NULL DEFAULT FALSE,
  "hasExternalCoverage"    BOOLEAN     NOT NULL DEFAULT FALSE,
  "hasBeneficiaries"       BOOLEAN     NOT NULL DEFAULT FALSE,
  "hasAttorney"            BOOLEAN     NOT NULL DEFAULT FALSE,
  "employerName"           TEXT,
  "employerCode"           TEXT,
  "rawImportantFieldsJson" JSONB,
  "sourceStableKey"        TEXT        NOT NULL UNIQUE,
  "createdAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"              TIMESTAMP(3) NOT NULL,
  CONSTRAINT "customer_financial_products_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "customers" ("id") ON DELETE CASCADE,
  CONSTRAINT "customer_financial_products_providerId_fkey"
    FOREIGN KEY ("providerId") REFERENCES "institutional_providers" ("id"),
  CONSTRAINT "customer_financial_products_importJobId_fkey"
    FOREIGN KEY ("importJobId") REFERENCES "import_jobs" ("id")
);

CREATE INDEX IF NOT EXISTS "cust_fin_products_customerId_idx"      ON "customer_financial_products" ("customerId");
CREATE INDEX IF NOT EXISTS "cust_fin_products_providerId_idx"      ON "customer_financial_products" ("providerId");
CREATE INDEX IF NOT EXISTS "cust_fin_products_source_idx"          ON "customer_financial_products" ("source");
CREATE INDEX IF NOT EXISTS "cust_fin_products_productTypeCode_idx" ON "customer_financial_products" ("productTypeCode");
CREATE INDEX IF NOT EXISTS "cust_fin_products_importJobId_idx"     ON "customer_financial_products" ("importJobId");

-- ============================================================
-- 6. CustomerBalanceSnapshot
-- ============================================================

CREATE TABLE IF NOT EXISTS "customer_balance_snapshots" (
  "id"                    TEXT        PRIMARY KEY,
  "productId"             TEXT        NOT NULL,
  "importJobId"           TEXT,
  "snapshotDate"          TIMESTAMP(3) NOT NULL,
  "snapshotKind"          TEXT        NOT NULL,
  "trackCode"             TEXT,
  "trackName"             TEXT,
  "balanceAmount"         DECIMAL(18, 2),
  "redemptionAmount"      DECIMAL(18, 2),
  "monthlyContribution"   DECIMAL(14, 2),
  "employeeContribution"  DECIMAL(14, 2),
  "employerContribution"  DECIMAL(14, 2),
  "compensationComponent" DECIMAL(14, 2),
  "ytdReturn"             DECIMAL(8, 4),
  "rawJson"               JSONB,
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "customer_balance_snapshots_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "customer_financial_products" ("id") ON DELETE CASCADE,
  CONSTRAINT "customer_balance_snapshots_importJobId_fkey"
    FOREIGN KEY ("importJobId") REFERENCES "import_jobs" ("id"),
  CONSTRAINT "customer_balance_snapshots_unique"
    UNIQUE ("productId", "snapshotDate", "snapshotKind", "trackCode")
);

CREATE INDEX IF NOT EXISTS "cust_balance_snapshots_product_date_idx"
  ON "customer_balance_snapshots" ("productId", "snapshotDate" DESC);
