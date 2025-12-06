CREATE TABLE "passage_column" (
	"id" text PRIMARY KEY NOT NULL,
	"passage_id" text NOT NULL,
	"starting_word_id" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "passage_segment" (
	"id" text PRIMARY KEY NOT NULL,
	"passage_split_id" text NOT NULL,
	"starting_word_id" text NOT NULL,
	"heading_one" text,
	"heading_two" text,
	"heading_three" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "passage_split" (
	"id" text PRIMARY KEY NOT NULL,
	"passage_column_id" text NOT NULL,
	"starting_word_id" text NOT NULL,
	"color" text DEFAULT 'green' NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "passage_column" ADD CONSTRAINT "passage_column_passage_id_passage_id_fk" FOREIGN KEY ("passage_id") REFERENCES "public"."passage"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passage_segment" ADD CONSTRAINT "passage_segment_passage_split_id_passage_split_id_fk" FOREIGN KEY ("passage_split_id") REFERENCES "public"."passage_split"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passage_split" ADD CONSTRAINT "passage_split_passage_column_id_passage_column_id_fk" FOREIGN KEY ("passage_column_id") REFERENCES "public"."passage_column"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "passage_column_passage_id_idx" ON "passage_column" USING btree ("passage_id");--> statement-breakpoint
CREATE INDEX "passage_column_starting_word_idx" ON "passage_column" USING btree ("starting_word_id");--> statement-breakpoint
CREATE INDEX "passage_segment_split_id_idx" ON "passage_segment" USING btree ("passage_split_id");--> statement-breakpoint
CREATE INDEX "passage_segment_starting_word_idx" ON "passage_segment" USING btree ("starting_word_id");--> statement-breakpoint
CREATE INDEX "passage_split_column_id_idx" ON "passage_split" USING btree ("passage_column_id");--> statement-breakpoint
CREATE INDEX "passage_split_starting_word_idx" ON "passage_split" USING btree ("starting_word_id");--> statement-breakpoint
ALTER TABLE "passage_split" ADD CONSTRAINT "passage_split_color_check" CHECK (color IN ('red', 'orange', 'yellow', 'green', 'aqua', 'blue', 'purple', 'pink'));
