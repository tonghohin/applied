ALTER TABLE "search_runs" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "search_runs" ALTER COLUMN "status" SET DEFAULT 'pending'::text;--> statement-breakpoint
UPDATE "search_runs" SET "status" = 'failed' WHERE "status" = 'captcha';--> statement-breakpoint
DROP TYPE "public"."search_run_status";--> statement-breakpoint
CREATE TYPE "public"."search_run_status" AS ENUM('pending', 'running', 'completed', 'failed');--> statement-breakpoint
ALTER TABLE "search_runs" ALTER COLUMN "status" SET DEFAULT 'pending'::"public"."search_run_status";--> statement-breakpoint
ALTER TABLE "search_runs" ALTER COLUMN "status" SET DATA TYPE "public"."search_run_status" USING "status"::"public"."search_run_status";