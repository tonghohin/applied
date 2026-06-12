"use client";

import { trpc } from "@/lib/trpc";
import type { SseEvent } from "@repo/api";
import type { RouterOutputs } from "@repo/api";
import { useRef } from "react";

type JobList = RouterOutputs["jobs"]["list"];
type RunList = RouterOutputs["runs"]["list"];
type Stats = RouterOutputs["dashboard"]["getStats"];

export function applyJobStatusEvent(
  jobs: JobList,
  event: Extract<SseEvent, { type: "job:status" }>
): JobList {
  return jobs.map((job) =>
    job.id === event.jobId
      ? {
          ...job,
          status: event.status,
          appliedAt: event.appliedAt,
          failureReason: event.failureReason,
          updatedAt: event.updatedAt,
        }
      : job
  );
}

export function applyDashboardJobStatusEvent(
  stats: Stats,
  event: Extract<SseEvent, { type: "job:status" }>
): Stats {
  return {
    ...stats,
    jobs: stats.jobs.map((job) =>
      job.id === event.jobId
        ? { ...job, status: event.status, appliedAt: event.appliedAt, updatedAt: event.updatedAt }
        : job
    ),
  };
}

export function applyApplyRunUpdateEvent(
  jobs: JobList,
  event: Extract<SseEvent, { type: "apply-run:update" }>
): JobList {
  return jobs.map((job) => (job.id === event.jobId ? { ...job, latestApplyRun: event.run } : job));
}

export function applyApplyRunLogEvent(
  jobs: JobList,
  event: Extract<SseEvent, { type: "apply-run:log" }>
): JobList {
  return jobs.map((job) => {
    if (job.id !== event.jobId) return job;
    if (!job.latestApplyRun) return job;
    return {
      ...job,
      latestApplyRun: {
        ...job.latestApplyRun,
        logs: [...job.latestApplyRun.logs, event.log],
      },
    };
  });
}

export function applySearchRunUpdateEvent(
  runs: RunList,
  event: Extract<SseEvent, { type: "search-run:update" }>
): RunList {
  // Scheduled runs are created by the worker, so the run may not be in the
  // list yet — prepend it (runs are ordered by startedAt desc).
  if (!runs.some((run) => run.id === event.run.id)) {
    return [event.run, ...runs];
  }
  return runs.map((run) => (run.id === event.run.id ? event.run : run));
}

export function applyDashboardSearchRunUpdateEvent(
  stats: Stats,
  event: Extract<SseEvent, { type: "search-run:update" }>
): Stats {
  if (!stats.searchRuns.some((run) => run.id === event.run.id)) {
    return { ...stats, searchRuns: [event.run, ...stats.searchRuns] };
  }
  return {
    ...stats,
    searchRuns: stats.searchRuns.map((run) => (run.id === event.run.id ? event.run : run)),
  };
}

export function SseProvider({ children }: { children: React.ReactNode }) {
  const utils = trpc.useUtils();
  const hasStartedRef = useRef(false);

  trpc.events.onUpdate.useSubscription(undefined, {
    onStarted() {
      if (hasStartedRef.current) {
        utils.jobs.list.invalidate();
        utils.runs.list.invalidate();
        utils.dashboard.getStats.invalidate();
      }
      hasStartedRef.current = true;
    },
    onData(event) {
      switch (event.type) {
        case "job:status": {
          utils.jobs.list.setData(undefined, (jobs) =>
            jobs ? applyJobStatusEvent(jobs, event) : jobs
          );
          utils.dashboard.getStats.setData(undefined, (stats) =>
            stats ? applyDashboardJobStatusEvent(stats, event) : stats
          );
          break;
        }
        case "apply-run:update": {
          utils.jobs.list.setData(undefined, (jobs) =>
            jobs ? applyApplyRunUpdateEvent(jobs, event) : jobs
          );
          break;
        }
        case "apply-run:log": {
          utils.jobs.list.setData(undefined, (jobs) =>
            jobs ? applyApplyRunLogEvent(jobs, event) : jobs
          );
          break;
        }
        case "search-run:update": {
          utils.runs.list.setData(undefined, (runs) =>
            runs ? applySearchRunUpdateEvent(runs, event) : runs
          );
          utils.dashboard.getStats.setData(undefined, (stats) =>
            stats ? applyDashboardSearchRunUpdateEvent(stats, event) : stats
          );
          if (event.run.status === "completed") {
            utils.jobs.list.invalidate();
          }
          break;
        }
      }
    },
    onError(err) {
      console.error("[sse] subscription error:", err);
    },
  });

  return <>{children}</>;
}
