-- Migration: Add left_offset column to passage_column table
-- Adds support for user-adjusted (horizontal) column spacing in the Analyze view.
-- NULL/0 = default spacing (current behaviour). A positive integer is EXTRA spacing
-- in pixels ADDED to the gap on the column's LEADING (left) side, beyond its default
-- gap (so a column can be pushed right to separate it from the previous column).
-- It can never be tighter than the default, since the value is purely additive.
-- The first column in a passage is never offset. The total gap (default + offset)
-- is capped at 294px by the application.

ALTER TABLE "passage_column" ADD COLUMN "left_offset" integer;
