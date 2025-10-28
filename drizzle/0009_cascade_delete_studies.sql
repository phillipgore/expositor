-- Migration: Change study.groupId foreign key to CASCADE delete instead of SET NULL
-- When a study group is deleted, all studies in that group should also be deleted

-- Drop the existing foreign key constraint
ALTER TABLE "study" DROP CONSTRAINT IF EXISTS "study_group_id_study_group_id_fk";

-- Add the new foreign key constraint with CASCADE delete
ALTER TABLE "study" 
ADD CONSTRAINT "study_group_id_study_group_id_fk" 
FOREIGN KEY ("group_id") 
REFERENCES "study_group"("id") 
ON DELETE CASCADE;
