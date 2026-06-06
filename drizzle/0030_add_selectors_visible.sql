-- Migration: Add selectors_visible column to user table
-- Backs the "Selection Controls" toggle in the View menu, which reveals the
-- Column and Section selector buttons in the Analyze view without requiring the
-- Command/Ctrl key to be held. DEFAULT false matches the prior behaviour, where
-- the selectors stayed hidden until Command/Ctrl was pressed.

ALTER TABLE "user" ADD COLUMN "selectors_visible" boolean DEFAULT false;
