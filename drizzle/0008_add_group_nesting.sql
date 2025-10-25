ALTER TABLE "study_group" ADD COLUMN "parent_group_id" text;
ALTER TABLE "study_group" ADD CONSTRAINT "study_group_parent_group_id_study_group_id_fk" FOREIGN KEY ("parent_group_id") REFERENCES "study_group"("id") ON DELETE cascade ON UPDATE no action;
