ALTER TABLE "profiles" RENAME COLUMN "cover_letter_markdown" TO "cover_letter_instructions";--> statement-breakpoint
ALTER TABLE "profiles" ALTER COLUMN "cover_letter_instructions" DROP NOT NULL;
