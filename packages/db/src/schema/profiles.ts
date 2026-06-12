import { boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { noticePeriodEnum } from "./enums";

export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  phone: text("phone").notNull(),
  address: text("address").notNull(),
  linkedinUrl: text("linkedin_url"),
  githubUrl: text("github_url"),
  websiteUrl: text("website_url"),
  resume: text("resume").notNull(),
  coverLetterInstructions: text("cover_letter_instructions"),
  requiresSponsorship: boolean("requires_sponsorship").notNull().default(false),
  noticePeriod: noticePeriodEnum("notice_period").notNull().default("2_weeks"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Profile = typeof profiles.$inferSelect;
