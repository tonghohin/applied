ALTER TABLE "profiles" ALTER COLUMN "notice_period" SET DEFAULT '2_weeks';--> statement-breakpoint
UPDATE "profiles" SET "notice_period" = '2_weeks' WHERE "notice_period" IS NULL;--> statement-breakpoint
ALTER TABLE "profiles" ALTER COLUMN "notice_period" SET NOT NULL;