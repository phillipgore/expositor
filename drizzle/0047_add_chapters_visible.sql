-- Migration: Add chapters_visible / document_chapters_visible columns to user table
-- Backs the "Chapters" toggle in the View menu (Analyze and Document views keep
-- independent settings). When off, verse notations drop their chapter prefix
-- ("5:3" → "3") except on verse 1 of each chapter and the first verse of each
-- passage. DEFAULT true matches the prior behaviour (full chapter:verse shown).
-- Written by hand (see note in 0046).

ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "chapters_visible" boolean DEFAULT true;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "document_chapters_visible" boolean DEFAULT true;
