-- Migration: word-level passage bounds (SERIES_PLAN §8, stage 1 of word-granular parts)
-- A part may now begin or end part-way through a verse. `from_word` is the first word of the
-- first verse (NULL = word 1); `to_word` is the last word of the last verse (NULL = end of verse).
-- NULL means "whole verse", so every existing row is unchanged and no backfill is needed.
-- Written by hand (see note in 0046).

ALTER TABLE "passage" ADD COLUMN IF NOT EXISTS "from_word" integer;
ALTER TABLE "passage" ADD COLUMN IF NOT EXISTS "to_word" integer;
