import type { Job } from "@/lib/trpc";
import { describe, expect, it } from "vitest";
import { filterAndSortJobs } from "./jobs-filter";

let nextId = 0;

function makeJob(overrides: Partial<Job> = {}): Job {
  nextId += 1;
  return {
    id: `job-${nextId}`,
    userId: "user-1",
    title: "Senior Frontend Engineer",
    company: "Vercel",
    location: "Remote",
    description: "Job description",
    url: "https://example.com/job",
    platform: "linkedin",
    workplaceType: "remote",
    score: 90,
    status: "pending_review",
    runId: "run-1",
    appliedAt: null,
    failureReason: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    latestApplyRun: null,
    appliedCountAtCompany: 0,
    rejectedCountAtCompany: 0,
    appliedTitlesAtCompany: [],
    ...overrides,
  };
}

const baseArgs = {
  statuses: [] as Job["status"][],
  workplaceTypes: [] as Job["workplaceType"][],
  search: "",
  sortBy: "score-desc" as const,
};

describe("filterAndSortJobs", () => {
  it("returns an empty array for empty input", () => {
    expect(filterAndSortJobs([], baseArgs)).toEqual([]);
  });

  it("hides jobs whose status is not in the default visible set", () => {
    const jobs = [
      makeJob({ status: "pending_review" }),
      makeJob({ status: "applied" }),
      makeJob({ status: "rejected" }),
      makeJob({ status: "skipped" }),
    ];

    const result = filterAndSortJobs(jobs, {
      ...baseArgs,
      statuses: ["pending_review", "applying", "failed"],
    });

    expect(result.map((job) => job.status)).toEqual(["pending_review"]);
  });

  it("shows every status when the status filter is empty (all)", () => {
    const jobs = [
      makeJob({ status: "pending_review" }),
      makeJob({ status: "applied" }),
      makeJob({ status: "skipped" }),
    ];

    const result = filterAndSortJobs(jobs, { ...baseArgs, statuses: [] });

    expect(result).toHaveLength(3);
  });

  it("narrows by workplace type", () => {
    const jobs = [
      makeJob({ workplaceType: "remote" }),
      makeJob({ workplaceType: "hybrid" }),
      makeJob({ workplaceType: "on-site" }),
    ];

    const result = filterAndSortJobs(jobs, { ...baseArgs, workplaceTypes: ["remote"] });

    expect(result.map((job) => job.workplaceType)).toEqual(["remote"]);
  });

  it("matches search against title, company, and location, case-insensitively", () => {
    const jobs = [
      makeJob({ title: "Staff Software Engineer", company: "Anthropic", location: "New York" }),
      makeJob({ title: "Product Engineer", company: "Linear", location: "San Francisco" }),
    ];

    expect(filterAndSortJobs(jobs, { ...baseArgs, search: "anthropic" })).toHaveLength(1);
    expect(filterAndSortJobs(jobs, { ...baseArgs, search: "SAN FRANCISCO" })).toHaveLength(1);
    expect(filterAndSortJobs(jobs, { ...baseArgs, search: "staff" })).toHaveLength(1);
    expect(filterAndSortJobs(jobs, { ...baseArgs, search: "nonexistent" })).toHaveLength(0);
  });

  it("sorts by score descending", () => {
    const jobs = [makeJob({ score: 50 }), makeJob({ score: 90 }), makeJob({ score: 70 })];
    const result = filterAndSortJobs(jobs, { ...baseArgs, sortBy: "score-desc" });
    expect(result.map((job) => job.score)).toEqual([90, 70, 50]);
  });

  it("sorts by score ascending", () => {
    const jobs = [makeJob({ score: 50 }), makeJob({ score: 90 }), makeJob({ score: 70 })];
    const result = filterAndSortJobs(jobs, { ...baseArgs, sortBy: "score-asc" });
    expect(result.map((job) => job.score)).toEqual([50, 70, 90]);
  });

  it("sorts newest first", () => {
    const jobs = [
      makeJob({ createdAt: new Date("2026-01-01T00:00:00.000Z") }),
      makeJob({ createdAt: new Date("2026-03-01T00:00:00.000Z") }),
      makeJob({ createdAt: new Date("2026-02-01T00:00:00.000Z") }),
    ];
    const result = filterAndSortJobs(jobs, { ...baseArgs, sortBy: "newest" });
    expect(result.map((job) => job.createdAt.getUTCMonth())).toEqual([2, 1, 0]);
  });

  it("sorts oldest first", () => {
    const jobs = [
      makeJob({ createdAt: new Date("2026-01-01T00:00:00.000Z") }),
      makeJob({ createdAt: new Date("2026-03-01T00:00:00.000Z") }),
      makeJob({ createdAt: new Date("2026-02-01T00:00:00.000Z") }),
    ];
    const result = filterAndSortJobs(jobs, { ...baseArgs, sortBy: "oldest" });
    expect(result.map((job) => job.createdAt.getUTCMonth())).toEqual([0, 1, 2]);
  });
});
