ALTER TABLE "passage_split" ALTER COLUMN "color" SET DEFAULT 'blue';--> statement-breakpoint
ALTER TABLE "passage_segment" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "passage_segment" ADD COLUMN "commentary" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "commentary_panel_width" integer DEFAULT 300;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "commentary_panel_open" boolean DEFAULT false;