CREATE TYPE "public"."notice_period" AS ENUM('immediately', '1_week', '2_weeks', '3_weeks', '4_weeks');--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "notice_period" "notice_period";