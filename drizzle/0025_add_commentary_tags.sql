CREATE TABLE IF NOT EXISTS "commentary_tag" (
	"id" text PRIMARY KEY NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"term_id" text NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "commentary_tag_subject_type_check" CHECK (subject_type IN ('segment', 'section', 'column', 'connection'))
);

CREATE INDEX IF NOT EXISTS "commentary_tag_subject_idx" ON "commentary_tag" ("subject_type", "subject_id");
CREATE INDEX IF NOT EXISTS "commentary_tag_term_id_idx" ON "commentary_tag" ("term_id");
