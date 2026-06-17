-- Migration: Add passage_dividers_visible column to user table
-- Backs the "Passage Dividers" toggle in the View menu, which shows the vertical
-- divider line between adjacent passages in the Analyze view. When on (the
-- default), the divider is drawn and the cross-passage gap is double width (a gap
-- slot on each side of the divider). When off, the divider is hidden and the gap
-- collapses to single width. DEFAULT true matches the prior behaviour, where the
-- dividers were always shown.

ALTER TABLE "user" ADD COLUMN "passage_dividers_visible" boolean DEFAULT true;
