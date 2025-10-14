-- Create study_group table
CREATE TABLE IF NOT EXISTS "study_group" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"user_id" text NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"is_collapsed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);

-- Add foreign key constraint for user_id
ALTER TABLE "study_group" ADD CONSTRAINT "study_group_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;

-- Add groupId column to study table
ALTER TABLE "study" ADD COLUMN "group_id" text;

-- Add foreign key constraint for group_id (SET NULL on delete)
ALTER TABLE "study" ADD CONSTRAINT "study_group_id_study_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "study_group"("id") ON DELETE set null ON UPDATE no action;
