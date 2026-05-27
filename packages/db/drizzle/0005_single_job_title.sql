ALTER TABLE "job_criteria" ADD COLUMN "job_title" text NOT NULL DEFAULT '';--> statement-breakpoint
UPDATE "job_criteria" SET "job_title" = COALESCE("job_titles"[1], '');--> statement-breakpoint
ALTER TABLE "job_criteria" DROP COLUMN "job_titles";
