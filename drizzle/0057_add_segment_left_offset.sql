-- Migration: per-segment horizontal position (Analyze view).
-- `left_offset` is how far (CSS px) a segment is pulled to the right within its column.
-- NULL = flush with the column (the default for every existing segment, so nothing
-- changes visually). Written by hand (see note in 0046); run with
-- `node scripts/run-migration-57.js`.

ALTER TABLE "passage_segment" ADD COLUMN IF NOT EXISTS "left_offset" integer;
