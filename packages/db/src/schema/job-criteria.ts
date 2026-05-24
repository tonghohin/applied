import { boolean, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";

export const jobCriteria = pgTable("job_criteria", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  jobTitles: text("job_titles").array().notNull().default([]),
  skills: text("skills").array().notNull().default([]),
  locations: text("locations").array().notNull().default([]),
  remote: boolean("remote").notNull().default(false),
  seniority: text("seniority").array().notNull().default([]),
  minSalary: integer("min_salary"),
});
