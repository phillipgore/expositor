-- Migration: Add Series (an ordered run of studies covering one continuous passage)
--
-- Phase 1 of SERIES_PLAN.md. Purely ADDITIVE: one new table, three new nullable
-- columns, three indexes. No existing column changes type or nullability, no data
-- is rewritten, and no existing row is touched. Every standalone study keeps
-- series_id = NULL and behaves exactly as before.
--
-- Written by hand, NOT by `drizzle-kit generate`. The drizzle/meta snapshots stop
-- at 0009 while migrations 0010-0045 were authored by hand, so drizzle-kit diffs
-- the schema against a snapshot that is ~36 migrations stale. Running generate
-- prompts nonsense like "is app_settings renamed from passage_split?" and, if
-- answered carelessly, would emit a destructive ALTER TABLE ... RENAME.
-- Follow the hand-written convention here until the snapshots are rebaselined.

CREATE TABLE IF NOT EXISTS "study_series" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"subtitle" text,
	"description" text,
	"user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
	"group_id" text REFERENCES "study_group"("id") ON DELETE CASCADE,
	-- Authoritative for the same-translation invariant: every part's
	-- study.translation must match this. Written at creation (phase 1c) from the
	-- source study; enforced when Join Parts / Split Part arrive (phase 2), and
	-- read by Q26's ESV/NET branching. Default matches study.translation's.
	"translation" text DEFAULT 'esv' NOT NULL,

	"display_order" integer DEFAULT 0 NOT NULL,
	"is_collapsed" boolean DEFAULT false NOT NULL,
	-- Which part the user last had open. ON DELETE SET NULL (not CASCADE):
	-- deleting the remembered part must never delete the series; NULL just
	-- falls back to part 1.
	"last_part_id" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);

-- A study that is one part of a series. NULL series_id = standalone study, which
-- is both the default and the common case.
ALTER TABLE "study" ADD COLUMN IF NOT EXISTS "series_id" text;
ALTER TABLE "study" ADD COLUMN IF NOT EXISTS "series_order" integer;

DO $$ BEGIN
	ALTER TABLE "study" ADD CONSTRAINT "study_series_id_fk"
		FOREIGN KEY ("series_id") REFERENCES "study_series"("id") ON DELETE CASCADE;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;

-- study_series.last_part_id -> study.id is added AFTER "study" exists, because
-- the two tables reference each other and neither can carry the constraint at
-- CREATE time.
DO $$ BEGIN
	ALTER TABLE "study_series" ADD CONSTRAINT "study_series_last_part_id_fk"
		FOREIGN KEY ("last_part_id") REFERENCES "study"("id") ON DELETE SET NULL;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;

-- Additive only, and deliberately nullable. Nothing in phase 1 writes or reads
-- this column: phase 1 ships no Split Part, no Join Parts and no boundary moves.
-- It exists now so that the eventual owner of a cross-part connection has a place
-- to live without a second migration.
--
-- NOTE: segment_connection.study_id remains NOT NULL. Cross-part connections
-- cannot be authored (connections are drawn over a single study's canvas), so
-- nothing can violate it yet. When boundary moves arrive they may slide under an
-- existing in-part connection; that is the case to decide then. "Cannot be drawn"
-- is not the same as "must not exist", so no constraint forbids the shape here.
-- See SERIES_PLAN.md section 4, Q42.
ALTER TABLE "segment_connection" ADD COLUMN IF NOT EXISTS "series_id" text;

DO $$ BEGIN
	ALTER TABLE "segment_connection" ADD CONSTRAINT "segment_connection_series_id_fk"
		FOREIGN KEY ("series_id") REFERENCES "study_series"("id") ON DELETE CASCADE;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "study_series_id_idx" ON "study" ("series_id");
CREATE INDEX IF NOT EXISTS "study_series_user_id_idx" ON "study_series" ("user_id");
CREATE INDEX IF NOT EXISTS "segment_connection_series_id_idx" ON "segment_connection" ("series_id");
