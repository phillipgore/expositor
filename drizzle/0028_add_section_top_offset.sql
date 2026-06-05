-- Migration: Add top_offset column to passage_section table
-- Adds support for user-repositioned (vertical) section spacing in the Analyze view.
-- NULL/0 = default spacing (current behaviour). A positive integer is EXTRA spacing
-- in pixels ADDED above the section beyond its default gap (so a section can be pushed
-- down to align with sections/segments in other columns). It can never be tighter than
-- the default, since the value is purely additive.

ALTER TABLE "passage_section" ADD COLUMN "top_offset" integer;
