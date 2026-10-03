-- Migration: user-adjusted connection line shape (draggable shaping handle)
-- `bend_along` / `bend_perp` store the handle position RELATIVE to the line's
-- anchor-to-anchor chord (fractions, not pixels) so a bend survives reflow/zoom.
-- NULL means the automatic shape, so every existing row is unchanged and no
-- backfill is needed. Written by hand (see note in 0046).

ALTER TABLE "segment_connection" ADD COLUMN IF NOT EXISTS "bend_along" real;
ALTER TABLE "segment_connection" ADD COLUMN IF NOT EXISTS "bend_perp" real;
