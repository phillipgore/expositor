-- Migration: Add commentary column to segment_connection table
-- Adds rich text commentary support for connection lines (mirrors passage_segment.commentary)

ALTER TABLE segment_connection
ADD COLUMN commentary TEXT;
