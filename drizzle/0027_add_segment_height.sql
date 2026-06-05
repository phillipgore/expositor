-- Migration: Add height column to passage_segment table
-- Adds support for user-resizable segment heights.
-- NULL = flexible/natural height (content-sized, default).
-- A positive integer is the user-set minimum height in pixels.

ALTER TABLE "passage_segment" ADD COLUMN "height" integer;
