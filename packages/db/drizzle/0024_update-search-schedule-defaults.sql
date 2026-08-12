ALTER TABLE "search_schedules" ALTER COLUMN "enabled" SET DEFAULT true;--> statement-breakpoint
ALTER TABLE "search_schedules" ALTER COLUMN "interval_hours" SET DEFAULT 1;--> statement-breakpoint
ALTER TABLE "search_schedules" ALTER COLUMN "end_hour" SET DEFAULT 9;--> statement-breakpoint
ALTER TABLE "search_schedules" ALTER COLUMN "days" SET DEFAULT '{0,1,2,3,4,5,6}';