import { describe, expect, it, vi } from "vitest";

vi.mock("@repo/db", () => ({
  platformEnum: { enumValues: ["linkedin"] },
}));

import type { Page } from "playwright";
import type { SearchCriteria } from "../types";
import { scrapeLinkedInJobs } from "./scraper";

const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();

const criteria: SearchCriteria = {
  jobTitles: ["Software Engineer"],
  locations: [{ location: "Remote", workTypes: ["remote"] }],
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
    evaluate: vi.fn().mockImplementation(() => {
      const response = evaluateResponses[i++];
      return response instanceof Error ? Promise.reject(response) : Promise.resolve(response);
    }),
  } as unknown as Page;
}

describe("scrapeLinkedInJobs", () => {
  it("stops pagination when listedAt is older than the 30-day cutoff", async () => {
    const page = makePage([
      [makeJob("1")], // page 1 job list
      "description 1", // fetchDescription for job 1
      [makeJob("2", sixtyDaysAgo)], // page 2: old job → hitCutoff
    ]);

    const results = await scrapeLinkedInJobs(page, criteria);

    const [first] = results;
    expect(results).toHaveLength(1);
    expect(first?.url).toBe("https://www.linkedin.com/jobs/view/1/");
  });

  it("uses sinceDate cutoff instead of 30-day default on subsequent runs", async () => {
    const sinceDate = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000); // 1 day ago

    const page = makePage([
      [makeJob("1", twelveHoursAgo), makeJob("2", twoDaysAgo)], // job1 new, job2 old vs sinceDate
      "description 1", // fetchDescription for job1 only
    ]);

    const results = await scrapeLinkedInJobs(page, criteria, sinceDate);

    const [first] = results;
    expect(results).toHaveLength(1);
    expect(first?.url).toBe("https://www.linkedin.com/jobs/view/1/");
  });

  it("includes job with empty description when fetchDescription fails", async () => {
    const page = makePage([
      [makeJob("1")], // page 1 job list
      new Error("timeout"), // fetchDescription throws
      [], // page 2: empty → break
    ]);

    const results = await scrapeLinkedInJobs(page, criteria);

    const [first] = results;
    expect(results).toHaveLength(1);
    expect(first?.description).toBe("");
  });

  it("deduplicates the same URL appearing on multiple pages", async () => {
    const page = makePage([
      [makeJob("1")], // page 1
      "description 1", // fetchDescription
      [makeJob("1")], // page 2: same URL → skipped by seen Set
      [], // page 3: empty → break
    ]);

    const results = await scrapeLinkedInJobs(page, criteria);

    expect(results).toHaveLength(1);
  });
});
