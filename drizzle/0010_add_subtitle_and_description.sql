-- Migration: Add subtitle to study table and description to study_group table
-- subtitle: optional text field for studies
-- description: optional text field for study groups

ALTER TABLE "study" ADD COLUMN "subtitle" text;
ALTER TABLE "study_group" ADD COLUMN "description" text;
