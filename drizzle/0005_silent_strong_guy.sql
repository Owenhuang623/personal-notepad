CREATE TABLE "work_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"local_date" date NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"duration_seconds" integer DEFAULT 0 NOT NULL,
	"source" text DEFAULT 'timer' NOT NULL,
	"auto_stopped" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "work_sessions_local_date" ON "work_sessions" USING btree ("local_date");--> statement-breakpoint
CREATE UNIQUE INDEX "work_sessions_one_running" ON "work_sessions" USING btree (("ended_at" is null)) WHERE "work_sessions"."ended_at" is null;