CREATE TABLE "notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text DEFAULT 'saved' NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "notes_one_scratch" ON "notes" USING btree ("kind") WHERE "notes"."kind" = 'scratch';--> statement-breakpoint
CREATE INDEX "notes_saved_updated_at" ON "notes" USING btree ("kind","updated_at" DESC NULLS LAST);