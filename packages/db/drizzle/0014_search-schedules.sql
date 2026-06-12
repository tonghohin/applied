CREATE TABLE "search_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"interval_hours" integer DEFAULT 2 NOT NULL,
	"start_hour" integer DEFAULT 9 NOT NULL,
	"end_hour" integer DEFAULT 17 NOT NULL,
	"days" integer[] DEFAULT '{1,2,3,4,5}' NOT NULL,
	"timezone" text NOT NULL,
	CONSTRAINT "search_schedules_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "search_schedules" ADD CONSTRAINT "search_schedules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;