ALTER TABLE "user" ADD COLUMN "analyze_zoom_level" integer DEFAULT 100;
ALTER TABLE "user" ADD COLUMN "analyze_zoom_mode" text DEFAULT 'percentage';
ALTER TABLE "user" ADD COLUMN "document_zoom_level" integer DEFAULT 100;
ALTER TABLE "user" ADD COLUMN "document_zoom_mode" text DEFAULT 'percentage';
