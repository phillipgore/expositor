-- Migration: per-connection line route (curved / straight / cornered)
-- `line_route` selects how a connection line is drawn between its anchors.
-- NULL means the default 'curved' bezier, so every existing row is unchanged and
-- no backfill is needed. Written by hand (see note in 0046).

ALTER TABLE "segment_connection" ADD COLUMN IF NOT EXISTS "line_route" text;
