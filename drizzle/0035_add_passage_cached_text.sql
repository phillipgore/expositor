-- Migration: Add cached passage text to passage table
-- Caches the fully-processed passage text (post-wrapWords HTML) so the study
-- loader can serve it directly instead of re-fetching from the translation API
-- on every page load. The verse range + study translation fully identify the
-- content, so this is a complete cache key.
--
-- cached_text:    NULL = not yet cached. The loader fetches live and lazily
--                 backfills this on first read. Re-fetched (invalidated) when a
--                 passage's verse range changes in the edit flow.
-- text_cached_at: When the text was last fetched. Reserved for future TTL/refresh;
--                 the cache is currently kept indefinitely (Bible text is stable).

ALTER TABLE "passage" ADD COLUMN "cached_text" text;
ALTER TABLE "passage" ADD COLUMN "text_cached_at" timestamp;
