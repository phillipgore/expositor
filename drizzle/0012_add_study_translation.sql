-- Add translation column to study table
-- This allows users to select which Bible translation (ESV or NET) to use for their study
-- Translation is set at study creation and cannot be changed later

ALTER TABLE study 
ADD COLUMN translation TEXT NOT NULL DEFAULT 'esv';

-- Ensure all existing studies have ESV as their translation
UPDATE study 
SET translation = 'esv' 
WHERE translation IS NULL;

-- Add check constraint to ensure only valid translations
ALTER TABLE study 
ADD CONSTRAINT study_translation_check 
CHECK (translation IN ('esv', 'net'));
