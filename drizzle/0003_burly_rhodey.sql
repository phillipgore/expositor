CREATE TABLE "study" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "passage" (
	"id" text PRIMARY KEY NOT NULL,
	"study_id" text NOT NULL,
	"testament" text NOT NULL,
	"book_id" text NOT NULL,
	"book_name" text NOT NULL,
	"from_chapter" integer NOT NULL,
	"to_chapter" integer NOT NULL,
	"from_verse" integer NOT NULL,
	"to_verse" integer NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "study" ADD CONSTRAINT "study_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "passage" ADD CONSTRAINT "passage_study_id_study_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."study"("id") ON DELETE cascade ON UPDATE no action;
