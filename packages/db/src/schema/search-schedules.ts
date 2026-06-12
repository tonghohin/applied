import { boolean, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";

export const searchSchedules = pgTable("search_schedules", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  enabled: boolean("enabled").notNull().default(false),
  intervalHours: integer("interval_hours").notNull().default(2),
  startHour: integer("start_hour").notNull().default(9),
  endHour: integer("end_hour").notNull().default(17),
  days: integer("days").array().notNull().default([1, 2, 3, 4, 5]),
  // No default — the form always submits a browser-detected or user-chosen value.
  timezone: text("timezone").notNull(),
});

export type SearchSchedule = typeof searchSchedules.$inferSelect;
