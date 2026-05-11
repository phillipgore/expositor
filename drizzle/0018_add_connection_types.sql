-- Migration: Extend segment_connection to support section and column connections
-- Adds connection_type discriminator and optional section/column ID columns

-- Add connection type discriminator (default 'segment' for backwards compat)
ALTER TABLE segment_connection ADD COLUMN IF NOT EXISTS connection_type TEXT NOT NULL DEFAULT 'segment';

-- Make segment IDs nullable (they will be NULL for section/column type connections)
ALTER TABLE segment_connection ALTER COLUMN from_segment_id DROP NOT NULL;
ALTER TABLE segment_connection ALTER COLUMN to_segment_id DROP NOT NULL;

-- Add section connection columns
ALTER TABLE segment_connection ADD COLUMN IF NOT EXISTS from_section_id TEXT REFERENCES passage_section(id) ON DELETE CASCADE;
ALTER TABLE segment_connection ADD COLUMN IF NOT EXISTS to_section_id TEXT REFERENCES passage_section(id) ON DELETE CASCADE;

-- Add column connection columns
ALTER TABLE segment_connection ADD COLUMN IF NOT EXISTS from_column_id TEXT REFERENCES passage_column(id) ON DELETE CASCADE;
ALTER TABLE segment_connection ADD COLUMN IF NOT EXISTS to_column_id TEXT REFERENCES passage_column(id) ON DELETE CASCADE;

-- Indexes for the new foreign key columns
CREATE INDEX IF NOT EXISTS segment_connection_from_section_id_idx ON segment_connection(from_section_id);
CREATE INDEX IF NOT EXISTS segment_connection_to_section_id_idx ON segment_connection(to_section_id);
CREATE INDEX IF NOT EXISTS segment_connection_from_column_id_idx ON segment_connection(from_column_id);
CREATE INDEX IF NOT EXISTS segment_connection_to_column_id_idx ON segment_connection(to_column_id);

-- Add check constraint to enforce mutual exclusivity of types
ALTER TABLE segment_connection ADD CONSTRAINT connection_type_check CHECK (
  connection_type IN ('segment', 'section', 'column')
);
