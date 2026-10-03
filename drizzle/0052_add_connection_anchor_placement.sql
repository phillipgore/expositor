-- Migration: user-placed connection points (drag an end anywhere along an
-- allowed side of its element). `*_anchor_edge` is the side ('top' | 'bottom' |
-- 'left' | 'right'); `*_anchor_pos` the fraction 0..1 along it. NULL means the
-- automatic placement, so every existing row is unchanged and no backfill is
-- needed. Written by hand (see note in 0046).

ALTER TABLE "segment_connection" ADD COLUMN IF NOT EXISTS "from_anchor_edge" text;
ALTER TABLE "segment_connection" ADD COLUMN IF NOT EXISTS "from_anchor_pos" real;
ALTER TABLE "segment_connection" ADD COLUMN IF NOT EXISTS "to_anchor_edge" text;
ALTER TABLE "segment_connection" ADD COLUMN IF NOT EXISTS "to_anchor_pos" real;
