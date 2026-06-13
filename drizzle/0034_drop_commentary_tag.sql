-- Migration: Drop the commentary_tag table
-- Glossary terms are now stored INLINE inside commentary prose (as glossary
-- badges within the rich text), not as separate per-subject tag rows. The
-- item-level tag table is therefore obsolete. Any existing rows are dropped
-- along with the table.

DROP INDEX IF EXISTS "commentary_tag_subject_idx";
DROP INDEX IF EXISTS "commentary_tag_term_id_idx";
DROP TABLE IF EXISTS "commentary_tag";
