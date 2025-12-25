-- Migration: Add note column to passage_segment table
-- Adds support for Quick Note feature that appears at the bottom of segments

ALTER TABLE passage_segment
ADD COLUMN note TEXT;
