ALTER TABLE "jobs" DROP COLUMN "fit_tier";--> statement-breakpoint
DROP TYPE "public"."fit_tier";--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "score" integer DEFAULT 0 NOT NULL;
