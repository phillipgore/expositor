-- Migration: Add width column to passage_column table
-- Adds support for user-adjusted column WIDTH in the Analyze view.
-- NULL = default width (the CSS default, currently 27.8rem / 49.8rem in wide layout).
-- A positive integer overrides the column's width (in CSS px) so the viewer can widen
-- or narrow a column. The application enforces a minimum readable width; there is no
-- upper limit.

ALTER TABLE "passage_column" ADD COLUMN "width" integer;
