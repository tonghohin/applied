CREATE TYPE "public"."workplace_type" AS ENUM('on-site', 'remote', 'hybrid');--> statement-breakpoint
ALTER TABLE "job_criteria" ADD COLUMN "exclude_keywords" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "workplace_type" "workplace_type" DEFAULT 'on-site' NOT NULL;