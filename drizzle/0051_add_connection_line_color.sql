-- Migration: per-connection line color ('mixed' = fade between the two ends' colors)
-- NULL means the default gray line, so every existing row is unchanged and no
-- backfill is needed. Written by hand (see note in 0046).

ALTER TABLE "segment_connection" ADD COLUMN IF NOT EXISTS "line_color" text;
