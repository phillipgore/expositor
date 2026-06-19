-- Migration: Move segment headings into their own passage_heading table
--
-- Headings were previously three nullable text columns on passage_segment
-- (heading_one/two/three). To make each heading an addressable, commentable
-- entity (its own id + commentary), they now live as rows in passage_heading,
-- consistent with how sections/columns/segments/connections carry commentary.
--
-- This migration:
--   1. Creates the passage_heading table.
--   2. Backfills one row per existing non-null heading_one/two/three value.
--   3. Drops the old heading_one/two/three columns from passage_segment.

CREATE TABLE IF NOT EXISTS passage_heading (
  id TEXT PRIMARY KEY,
  passage_segment_id TEXT NOT NULL REFERENCES passage_segment(id) ON DELETE CASCADE,
  heading_type TEXT NOT NULL CHECK (heading_type IN ('one', 'two', 'three')),
  text TEXT NOT NULL,
  commentary TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS passage_heading_segment_id_idx ON passage_heading(passage_segment_id);
-- At most one heading of each type per segment.
CREATE UNIQUE INDEX IF NOT EXISTS passage_heading_segment_type_unique
  ON passage_heading(passage_segment_id, heading_type);

-- Backfill existing headings as rows. gen_random_uuid() requires pgcrypto in
-- older Postgres; it is built-in from Postgres 13+. Each non-null/non-empty
-- heading column becomes one row.
INSERT INTO passage_heading (id, passage_segment_id, heading_type, text, created_at, updated_at)
SELECT gen_random_uuid()::text, id, 'one', heading_one, NOW(), NOW()
FROM passage_segment
WHERE heading_one IS NOT NULL AND heading_one <> '';

INSERT INTO passage_heading (id, passage_segment_id, heading_type, text, created_at, updated_at)
SELECT gen_random_uuid()::text, id, 'two', heading_two, NOW(), NOW()
FROM passage_segment
WHERE heading_two IS NOT NULL AND heading_two <> '';

INSERT INTO passage_heading (id, passage_segment_id, heading_type, text, created_at, updated_at)
SELECT gen_random_uuid()::text, id, 'three', heading_three, NOW(), NOW()
FROM passage_segment
WHERE heading_three IS NOT NULL AND heading_three <> '';

-- Drop the now-migrated columns.
ALTER TABLE passage_segment DROP COLUMN IF EXISTS heading_one;
ALTER TABLE passage_segment DROP COLUMN IF EXISTS heading_two;
ALTER TABLE passage_segment DROP COLUMN IF EXISTS heading_three;
