ALTER TABLE "jobs" ADD COLUMN "listed_at" timestamp;--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_user_id_url_unique" ON "jobs" USING btree ("user_id","url");