-- Migration: Add height_group_id column to passage_segment table
-- Adds support for LINKED segment heights: segments sharing the same
-- height_group_id are kept at the height of the tallest member and resize
-- together. NULL = not linked (default).

ALTER TABLE "passage_segment" ADD COLUMN "height_group_id" text;
