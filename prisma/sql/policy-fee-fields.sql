-- Move management fee data onto Policy directly. The management_fees
-- table was never populated by the importer and the separate one-to-many
-- relationship is overkill for two scalar percentages.

ALTER TABLE "policies"
  ADD COLUMN IF NOT EXISTS "feeOnAccumulationPct" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "feeOnPremiumPct" DOUBLE PRECISION;

DROP TABLE IF EXISTS "management_fees";
