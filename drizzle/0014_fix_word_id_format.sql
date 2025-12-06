-- Migration: Fix word ID format to match HTML (uppercase, 3-digit padding)
-- Convert from: jn-09-01-001 to: JN-009-001-001

-- Update passage_column
UPDATE passage_column
SET starting_word_id = UPPER(
  split_part(starting_word_id, '-', 1) || '-' ||
  LPAD(split_part(starting_word_id, '-', 2), 3, '0') || '-' ||
  LPAD(split_part(starting_word_id, '-', 3), 3, '0') || '-' ||
  split_part(starting_word_id, '-', 4)
);

-- Update passage_split
UPDATE passage_split
SET starting_word_id = UPPER(
  split_part(starting_word_id, '-', 1) || '-' ||
  LPAD(split_part(starting_word_id, '-', 2), 3, '0') || '-' ||
  LPAD(split_part(starting_word_id, '-', 3), 3, '0') || '-' ||
  split_part(starting_word_id, '-', 4)
);

-- Update passage_segment
UPDATE passage_segment
SET starting_word_id = UPPER(
  split_part(starting_word_id, '-', 1) || '-' ||
  LPAD(split_part(starting_word_id, '-', 2), 3, '0') || '-' ||
  LPAD(split_part(starting_word_id, '-', 3), 3, '0') || '-' ||
  split_part(starting_word_id, '-', 4)
);
