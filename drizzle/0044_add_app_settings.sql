CREATE TABLE IF NOT EXISTS "app_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"signups_enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp NOT NULL
);

INSERT INTO "app_settings" ("id", "signups_enabled", "updated_at")
VALUES ('app', true, now())
ON CONFLICT ("id") DO NOTHING;
