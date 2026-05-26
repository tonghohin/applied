import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { applyRunStatusEnum } from "./enums";
import { jobs } from "./jobs";

export type ApplyRunLog = { timestamp: string; message: string };

export const applyRuns = pgTable("apply_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id")
    .notNull()
    .references(() => jobs.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  status: applyRunStatusEnum("status").notNull().default("pending"),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
  errorMessage: text("error_message"),
  logs: jsonb("logs").$type<ApplyRunLog[]>().notNull().default([]),
});

export type ApplyRun = typeof applyRuns.$inferSelect;
