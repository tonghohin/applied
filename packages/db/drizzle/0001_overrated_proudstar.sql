ALTER TABLE "profiles" RENAME COLUMN "linkedin_email_encrypted" TO "linkedin_email";--> statement-breakpoint
ALTER TABLE "job_criteria" ALTER COLUMN "locations" SET DATA TYPE jsonb;--> statement-breakpoint
ALTER TABLE "job_criteria" ALTER COLUMN "locations" SET DEFAULT '[]'::jsonb;