-- Migration: indexes for the Finder's layout load. Written by hand (see note in 0046).
--
-- The (app) layout runs on every page and on every `invalidate('app:studies')`, and it reads
-- each table below filtered by these columns. None of them were indexed, so each read was a
-- sequential scan of the whole table across ALL users — cost grew with the size of the
-- database, not the size of the user's library. See FINDER_PERFORMANCE_REPORT.md.
--
-- Additive only and idempotent (IF NOT EXISTS): safe to re-run, no data changes.

CREATE INDEX IF NOT EXISTS "passage_study_id_idx" ON "passage" ("study_id", "display_order");
CREATE INDEX IF NOT EXISTS "study_user_id_idx" ON "study" ("user_id");
CREATE INDEX IF NOT EXISTS "study_group_user_id_idx" ON "study_group" ("user_id");
