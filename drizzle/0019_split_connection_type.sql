-- Migration: Replace single connection_type with per-end from_type + to_type
-- This enables cross-type connections (e.g. segment ↔ section)

-- Add per-end type columns (default 'segment' for backwards compat)
ALTER TABLE segment_connection ADD COLUMN IF NOT EXISTS from_type TEXT NOT NULL DEFAULT 'segment';
ALTER TABLE segment_connection ADD COLUMN IF NOT EXISTS to_type   TEXT NOT NULL DEFAULT 'segment';

-- Backfill both ends from the existing single connection_type value
UPDATE segment_connection SET from_type = connection_type, to_type = connection_type;

-- Drop the now-redundant single discriminator
ALTER TABLE segment_connection DROP COLUMN IF EXISTS connection_type;

-- Add check constraints for the new columns
ALTER TABLE segment_connection ADD CONSTRAINT from_type_check CHECK (from_type IN ('segment', 'section', 'column'));
ALTER TABLE segment_connection ADD CONSTRAINT to_type_check   CHECK (to_type   IN ('segment', 'section', 'column'));
