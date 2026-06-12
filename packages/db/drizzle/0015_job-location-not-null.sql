UPDATE "jobs" SET "location" = '' WHERE "location" IS NULL;--> statement-breakpoint
ALTER TABLE "jobs" ALTER COLUMN "location" SET NOT NULL;