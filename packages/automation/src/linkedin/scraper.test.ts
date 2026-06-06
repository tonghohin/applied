import { describe, expect, it, vi } from "vitest";

vi.mock("@repo/db", () => ({
  platformEnum: { enumValues: ["linkedin"] },
}));

import type { Page } from "playwright";
import type { SearchCriteria } from "../types";
import { scrapeLinkedInJobs } from "./scraper";
import { isExcluded } from "../utils";

const details = (description = "") => ({ description, workplaceType: "on-site" as const });

const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();

const criteria: SearchCriteria = {
  jobTitle: "Software Engineer",
  locations: [{ location: "Remote", workTypes: ["on-site", "remote", "hybrid"] }],
  excludeKeywords: [],
};

function makeJob(id: string, listedAt = twelveHoursAgo) {
  return {
    title: `Job ${id}`,
    company: "Acme",
    location: "Remote",
    url: `https://www.linkedin.com/jobs/view/${id}/`,
    description: "",
    platform: "linkedin" as const,
    listedAt,
  };
}

function makePage(evaluateResponses: unknown[]): Page {
  let i = 0;
  return {
    goto: vi.fn().mockResolvedValue(undefined),
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn().mockImplementation((fn: unknown) => {
      // The scroll function calls window.scrollBy — it returns void and we skip it
      if (typeof fn === "function" && fn.toString().includes("scrollBy")) {
        return Promise.resolve(undefined);
      }
      const response = evaluateResponses[i++] ?? [];
      return response instanceof Error ? Promise.reject(response) : Promise.resolve(response);
    }),
  } as unknown as Page;
}

describe("scrapeLinkedInJobs", () => {
  it("stops pagination when listedAt is older than the 30-day cutoff", async () => {
    // scrapeJobsPage needs 4 extractCards calls per page (1 with data + 3 stable rounds)
    const page = makePage([
      [makeJob("1")], [], [], [], // page 0 scrapeJobsPage: job1 found, then 3 stable
      details("description 1"),   // fetchJobDetails for job1
      [makeJob("2", sixtyDaysAgo)], [], [], [], // page 1: old job in 3 stable rounds
    ]);

    const results = await scrapeLinkedInJobs(page, criteria);

    const [first] = results;
    expect(results).toHaveLength(1);
    expect(first?.url).toBe("https://www.linkedin.com/jobs/view/1/");
  });

  it("uses sinceDate cutoff instead of 30-day default on subsequent runs", async () => {
    const sinceDate = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000); // 1 day ago

    const page = makePage([
      [makeJob("1", twelveHoursAgo), makeJob("2", twoDaysAgo)], [], [], [], // page 0: both cards, then 3 stable
      details("description 1"), // fetchJobDetails for job1 only (job2 old vs sinceDate)
    ]);

    const results = await scrapeLinkedInJobs(page, criteria, sinceDate);

    const [first] = results;
    expect(results).toHaveLength(1);
    expect(first?.url).toBe("https://www.linkedin.com/jobs/view/1/");
  });

  it("includes job with empty description when fetchJobDetails fails", async () => {
    const page = makePage([
      [makeJob("1")], [], [], [], // page 0: job1, then stable
      new Error("timeout"),        // fetchJobDetails throws → fallback to empty description
    ]);

    const results = await scrapeLinkedInJobs(page, criteria);

    const [first] = results;
    expect(results).toHaveLength(1);
    expect(first?.description).toBe("");
  });

  it("strips ' with verification' suffix from job titles", async () => {
    const jobWithBadge = { ...makeJob("1"), title: "Senior Engineer with verification" };
    const page = makePage([[jobWithBadge], [], [], [], details("description 1")]);

    const results = await scrapeLinkedInJobs(page, criteria);

    expect(results[0]?.title).toBe("Senior Engineer");
  });

  it("deduplicates the same URL appearing on multiple pages", async () => {
    const page = makePage([
      [makeJob("1")], [], [], [], // page 0
      details("description 1"),   // fetchJobDetails for job1
      [makeJob("1")], [], [], [], // page 1: same URL → skipped by seen Set in scrapeLinkedInJobs
    ]);

    const results = await scrapeLinkedInJobs(page, criteria);

    expect(results).toHaveLength(1);
  });

  it("skips jobs whose title matches an excluded keyword", async () => {
    const page = makePage([
      [makeJob("1"), { ...makeJob("2"), title: "Java Developer" }], [], [], [], // page 0
      details("description 1"), // only job1 gets fetchJobDetails (java job excluded before fetch)
    ]);

    const results = await scrapeLinkedInJobs(page, { ...criteria, excludeKeywords: ["java"] });

    expect(results).toHaveLength(1);
    expect(results[0]?.url).toBe("https://www.linkedin.com/jobs/view/1/");
  });
});

describe("isExcluded", () => {
  it("returns true when title contains the keyword as a whole word", () => {
    expect(isExcluded("Java Developer", ["java"])).toBe(true);
  });

  it("returns false when keyword appears only as a substring", () => {
    expect(isExcluded("JavaScript Engineer", ["java"])).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(isExcluded("JAVA Senior", ["java"])).toBe(true);
  });

  it("returns false when no keywords match", () => {
    expect(isExcluded("Senior PHP Developer", ["java"])).toBe(false);
  });

  it("returns false for an empty keywords array", () => {
    expect(isExcluded("React Developer", [])).toBe(false);
  });

  it("returns true when any keyword matches", () => {
    expect(isExcluded("PHP Backend", ["java", "php"])).toBe(true);
  });

  it("handles special regex characters in keywords", () => {
    expect(isExcluded("C++ Engineer", ["C++"])).toBe(true);
  });

  it("does not match partial words for special-char keywords", () => {
    expect(isExcluded("C# Developer", ["C++"])).toBe(false);
  });
});
