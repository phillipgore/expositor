-- Migration: LINKED column spacing, column width and section spacing (Analyze view).
-- Mirrors 0036 (passage_segment.height_group_id): items sharing the same group id
-- are kept at the same value and change together. NULL = not linked (default), so
-- nothing changes for existing data. Written by hand (see note in 0046); run with
-- `node scripts/run-migration-58.js`.

ALTER TABLE "passage_column" ADD COLUMN IF NOT EXISTS "spacing_group_id" text;
ALTER TABLE "passage_column" ADD COLUMN IF NOT EXISTS "width_group_id" text;
ALTER TABLE "passage_section" ADD COLUMN IF NOT EXISTS "spacing_group_id" text;
