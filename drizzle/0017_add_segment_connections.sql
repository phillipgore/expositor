-- Migration: Add segment_connection table
-- Adds support for the Connections feature that draws visual lines between segments

CREATE TABLE IF NOT EXISTS segment_connection (
  id TEXT PRIMARY KEY,
  study_id TEXT NOT NULL REFERENCES study(id) ON DELETE CASCADE,
  from_segment_id TEXT NOT NULL REFERENCES passage_segment(id) ON DELETE CASCADE,
  to_segment_id TEXT NOT NULL REFERENCES passage_segment(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS segment_connection_study_id_idx ON segment_connection(study_id);
CREATE INDEX IF NOT EXISTS segment_connection_from_segment_id_idx ON segment_connection(from_segment_id);
CREATE INDEX IF NOT EXISTS segment_connection_to_segment_id_idx ON segment_connection(to_segment_id);
