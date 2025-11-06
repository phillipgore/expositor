-- Migration: Add subtitle to study_group table
-- subtitle: optional text field for study groups

ALTER TABLE "study_group" ADD COLUMN "subtitle" text;
