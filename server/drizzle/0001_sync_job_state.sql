ALTER TABLE "sync_jobs" ADD COLUMN "state" jsonb;--> statement-breakpoint
ALTER TABLE "sync_jobs" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;