-- Migration: Add perpendicular "lead" gap for connection notes.
--   note_lead : unsigned px the note card floats AWAY from the connection line,
--               measured perpendicular to the card's anchored edge (the axis the
--               dot would travel straight off the line). NULL/0 = flush against
--               the line (today's behavior), so existing notes are unchanged and
--               no backfill is required.
--
-- This composes with the existing manual-placement columns added in 0031:
--   note_anchor_side : which edge of the card the dot attaches to
--   note_anchor_t    : 0..1 position of the dot ALONG the bezier curve
--   note_offset      : signed px the card slides ALONG its anchored edge
-- note_lead is the missing fourth axis — distance OFF the line.

ALTER TABLE "segment_connection" ADD COLUMN IF NOT EXISTS "note_lead" integer;
