-- Migration: text provenance and anchor context. Written by hand (see note in 0046).
--
-- Records what a future re-anchoring needs when our text processing changes or a translation is
-- revised: WHICH text the word ids were derived from (source + rules version), a per-verse
-- fingerprint to detect exactly which verses changed, a drift log when a refetch differs, and the
-- words around every start point so it can be found again if positions shift.
-- See src/lib/server/textProvenance.js for the rules these columns follow.
--
-- Additive only and idempotent (IF NOT EXISTS): safe to re-run. All columns nullable; NULL means
-- "recorded before provenance existed — unknown".
--
-- ⚠️ None of these are cleared with cached_text. Cache eviction (COMPLIANCE.md §5 item 1) removes
-- the scripture text; provenance and fingerprints must survive it, since they describe the text the
-- user's word ids were built on. Fingerprints are hashes, not text.

ALTER TABLE "passage" ADD COLUMN IF NOT EXISTS "text_source" text;
ALTER TABLE "passage" ADD COLUMN IF NOT EXISTS "text_rules_version" integer;
ALTER TABLE "passage" ADD COLUMN IF NOT EXISTS "text_fetched_at" timestamp;
ALTER TABLE "passage" ADD COLUMN IF NOT EXISTS "verse_fingerprints" jsonb;
ALTER TABLE "passage" ADD COLUMN IF NOT EXISTS "text_drift" jsonb;
ALTER TABLE "passage" ADD COLUMN IF NOT EXISTS "from_word_anchor" jsonb;
ALTER TABLE "passage" ADD COLUMN IF NOT EXISTS "to_word_anchor" jsonb;

ALTER TABLE "passage_column" ADD COLUMN IF NOT EXISTS "anchor_context" jsonb;
ALTER TABLE "passage_section" ADD COLUMN IF NOT EXISTS "anchor_context" jsonb;
ALTER TABLE "passage_segment" ADD COLUMN IF NOT EXISTS "anchor_context" jsonb;
