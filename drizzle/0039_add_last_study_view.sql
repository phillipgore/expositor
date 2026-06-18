-- Migration: Add last_study_view column to user table
-- Remembers the last study view ('analyze' | 'document') the user was in, so that
-- re-entering a study (after saving an edit, creating a new study, navigating away
-- and back, or opening a different study) restores the same view and highlights the
-- matching Analyze/Document toolbar button. DEFAULT 'analyze' matches the prior
-- behaviour, where the bare /study/[id] route always redirected to the Analyze view.

ALTER TABLE "user" ADD COLUMN "last_study_view" text DEFAULT 'analyze';
