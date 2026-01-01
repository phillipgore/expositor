-- Migration: Rename "split" to "section" throughout the database schema
-- This provides clearer terminology by using "section" instead of "split"

-- Rename the table
ALTER TABLE "passage_split" RENAME TO "passage_section";

-- Rename the primary key constraint
ALTER TABLE "passage_section" RENAME CONSTRAINT "passage_split_pkey" TO "passage_section_pkey";

-- Rename foreign key constraints
ALTER TABLE "passage_section" RENAME CONSTRAINT "passage_split_passage_column_id_passage_column_id_fk" TO "passage_section_passage_column_id_passage_column_id_fk";
ALTER TABLE "passage_segment" RENAME CONSTRAINT "passage_segment_passage_split_id_passage_split_id_fk" TO "passage_segment_passage_section_id_passage_section_id_fk";

-- Note: Check constraint is automatically renamed when table is renamed

-- Rename indexes
ALTER INDEX "passage_split_column_id_idx" RENAME TO "passage_section_column_id_idx";
ALTER INDEX "passage_split_starting_word_idx" RENAME TO "passage_section_starting_word_idx";
ALTER INDEX "passage_segment_split_id_idx" RENAME TO "passage_segment_section_id_idx";

-- Rename the column in passage_segment table
ALTER TABLE "passage_segment" RENAME COLUMN "passage_split_id" TO "passage_section_id";
