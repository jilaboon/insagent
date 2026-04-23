-- Speed up rule-session queries. Before this, filtering insights by
-- linkedRuleId was a sequential scan.

CREATE INDEX IF NOT EXISTS "insights_linkedRuleId_idx"
  ON "insights" ("linkedRuleId");

CREATE INDEX IF NOT EXISTS "insights_linkedRuleId_status_idx"
  ON "insights" ("linkedRuleId", "status");
