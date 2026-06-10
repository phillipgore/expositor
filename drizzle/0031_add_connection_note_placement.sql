-- Migration: Add manual note placement columns to segment_connection
-- Replaces the algorithmic note-avoidance system with user-controlled placement.
--   note_anchor_side : which edge of the card the anchor dot attaches to
--                      ('top' | 'right' | 'bottom' | 'left'). NULL = 'top'.
--   note_anchor_t    : 0..1 position of the dot ALONG the connection's bezier
--                      curve. NULL = 0.5 (the midpoint).
--   note_offset      : signed px the card is slid along its anchored edge
--                      (horizontal for top/bottom, vertical for left/right).
--                      NULL/0 = centered on the dot.
-- All NULL = today's default (centered on the line, anchored at the top), so no
-- backfill is required for existing notes.

ALTER TABLE "segment_connection" ADD COLUMN IF NOT EXISTS "note_anchor_side" text;
ALTER TABLE "segment_connection" ADD COLUMN IF NOT EXISTS "note_anchor_t" real;
ALTER TABLE "segment_connection" ADD COLUMN IF NOT EXISTS "note_offset" integer;
