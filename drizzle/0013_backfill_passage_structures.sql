-- Backfill default column, split, and segment for all existing passages
-- This migration adds the default structure to passages that were created before the new tables existed

-- Insert default columns for all passages that don't have one
INSERT INTO passage_column (id, passage_id, starting_word_id, created_at, updated_at)
SELECT 
    gen_random_uuid()::text,
    p.id,
    (
        LOWER(p.book_id) || '-' ||
        LPAD(p.from_chapter::text, 2, '0') || '-' ||
        LPAD(p.from_verse::text, 2, '0') || '-001'
    ) as starting_word_id,
    NOW(),
    NOW()
FROM passage p
WHERE NOT EXISTS (
    SELECT 1 FROM passage_column pc WHERE pc.passage_id = p.id
);

-- Insert default splits for all columns we just created (or that already existed)
INSERT INTO passage_split (id, passage_column_id, starting_word_id, color, created_at, updated_at)
SELECT 
    gen_random_uuid()::text,
    pc.id,
    pc.starting_word_id,
    'blue',
    NOW(),
    NOW()
FROM passage_column pc
WHERE NOT EXISTS (
    SELECT 1 FROM passage_split ps WHERE ps.passage_column_id = pc.id
);

-- Insert default segments for all splits we just created (or that already existed)
INSERT INTO passage_segment (id, passage_split_id, starting_word_id, heading_one, heading_two, heading_three, created_at, updated_at)
SELECT 
    gen_random_uuid()::text,
    ps.id,
    ps.starting_word_id,
    NULL,
    NULL,
    NULL,
    NOW(),
    NOW()
FROM passage_split ps
WHERE NOT EXISTS (
    SELECT 1 FROM passage_segment psg WHERE psg.passage_split_id = ps.id
);
