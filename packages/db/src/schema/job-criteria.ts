import type { LocationEntry } from "@repo/shared";
import { boolean, integer, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";

export const jobCriteria = pgTable("job_criteria", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  jobTitle: text("job_title").notNull().default(""),
  skills: text("skills").array().notNull().default([]),
  locations: jsonb("locations").notNull().default([]).$type<LocationEntry[]>(),
  seniority: text("seniority").array().notNull().default([]),
  excludeKeywords: text("exclude_keywords").array().notNull().default([]),
  excludeCompanies: text("exclude_companies").array().notNull().default([]),
  minSalary: integer("min_salary").notNull(),
  skipDuplicateIdentity: boolean("skip_duplicate_identity").notNull().default(true),
});
