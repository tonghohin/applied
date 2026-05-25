import { integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import type { LocationEntry } from "@repo/shared";
import { users } from "./auth";
import { platformEnum, searchRunStatusEnum } from "./enums";

export type SearchCriteriaSnapshot = {
  jobTitles: string[];
  skills: string[];
  locations: LocationEntry[];
};

export const searchRuns = pgTable("search_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  platform: platformEnum("platform").notNull(),
  status: searchRunStatusEnum("status").notNull().default("pending"),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
  jobCount: integer("job_count").notNull().default(0),
  errorMessage: text("error_message"),
  searchCriteria: jsonb("search_criteria").$type<SearchCriteriaSnapshot>(),
});

export type SearchRun = typeof searchRuns.$inferSelect;
