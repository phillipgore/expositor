-- Migration: Add layout_controls_visible column to user table
-- Backs the "Layout Controls" toggle in the View menu, which reveals the Column,
-- Section, and Segment layout handles (reposition/resize affordances) in the
-- Analyze view without requiring the user to hover over them. DEFAULT false
-- matches the prior behaviour, where the handles stayed hidden until hovered.

ALTER TABLE "user" ADD COLUMN "layout_controls_visible" boolean DEFAULT false;
