-- Migration: move color from passage_section to passage_segment.
-- Segments now carry their own color; selecting a column/section and choosing a
-- color recolors every segment it contains. Each segment inherits its current
-- section's color, so nothing changes visually. Written by hand (see note in 0046).

ALTER TABLE "passage_segment" ADD COLUMN IF NOT EXISTS "color" text;

UPDATE "passage_segment" AS seg
SET "color" = sec."color"
FROM "passage_section" AS sec
WHERE seg."passage_section_id" = sec."id";

-- Safety net (a segment always has a section via the FK, but never leave NULLs).
UPDATE "passage_segment" SET "color" = 'blue' WHERE "color" IS NULL;

ALTER TABLE "passage_segment" ALTER COLUMN "color" SET DEFAULT 'blue';
ALTER TABLE "passage_segment" ALTER COLUMN "color" SET NOT NULL;
ALTER TABLE "passage_segment" DROP CONSTRAINT IF EXISTS "passage_segment_color_check";
ALTER TABLE "passage_segment" ADD CONSTRAINT "passage_segment_color_check"
	CHECK ("color" IN ('red', 'orange', 'yellow', 'green', 'aqua', 'blue', 'purple', 'pink'));

-- The section check was created as passage_split_color_check (0008) and kept that
-- name through the 0016 rename; drop either name.
ALTER TABLE "passage_section" DROP CONSTRAINT IF EXISTS "passage_split_color_check";
ALTER TABLE "passage_section" DROP CONSTRAINT IF EXISTS "passage_section_color_check";
ALTER TABLE "passage_section" DROP COLUMN IF EXISTS "color";
