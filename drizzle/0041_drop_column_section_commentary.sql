-- Migration: Drop column- and section-level commentary
--
-- Commentary now lives on headings (passage_heading.commentary), segments,
-- and connections. The broad-scope commentary that previously lived on
-- passage_column and passage_section is no longer authored or displayed, so
-- the columns are removed. Any existing values are discarded.

ALTER TABLE passage_column DROP COLUMN IF EXISTS commentary;
ALTER TABLE passage_section DROP COLUMN IF EXISTS commentary;
