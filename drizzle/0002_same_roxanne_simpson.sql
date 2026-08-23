ALTER TABLE "notes" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "journal_date" date;--> statement-breakpoint
CREATE UNIQUE INDEX "notes_one_per_day" ON "notes" USING btree ("journal_date") WHERE "notes"."kind" = 'daily';