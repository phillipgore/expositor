ALTER TABLE "study" DROP CONSTRAINT "study_group_id_study_group_id_fk";
--> statement-breakpoint
ALTER TABLE "study" ADD COLUMN "subtitle" text;--> statement-breakpoint
ALTER TABLE "study" ADD COLUMN "translation" text DEFAULT 'esv' NOT NULL;--> statement-breakpoint
ALTER TABLE "study_group" ADD COLUMN "subtitle" text;--> statement-breakpoint
ALTER TABLE "study_group" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "study_group" ADD COLUMN "parent_group_id" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "studies_panel_width" integer DEFAULT 300;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "studies_panel_open" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "study" ADD CONSTRAINT "study_group_id_study_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."study_group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_group" ADD CONSTRAINT "study_group_parent_group_id_study_group_id_fk" FOREIGN KEY ("parent_group_id") REFERENCES "public"."study_group"("id") ON DELETE cascade ON UPDATE no action;