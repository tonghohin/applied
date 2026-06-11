import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@repo/db", () => ({
  platformEnum: { enumValues: ["linkedin"] },
}));

import { isExcluded } from "@repo/shared";
import type { Page } from "playwright";
import type { SearchCriteria } from "../types";
import { scrapeLinkedInJobs } from "./scraper";

const details = (description = "") => ({
  description,
});

const criteria: SearchCriteria = {
  jobTitle: "Software Engineer",
  locations: [{ location: "Remote", workTypes: ["on-site"] }],
  excludeKeywords: [],
};

const noKnownUrls = new Set<string>();

function makeJob(id: string) {
  return {
    title: `Job ${id}`,
    company: "Acme",
    location: "Remote",
    url: `https://www.linkedin.com/jobs/view/${id}/`,
    description: "",
    platform: "linkedin" as const,
  };
}

function makePage(evaluateResponses: unknown[]): Page {
  let i = 0;
  return {
    goto: vi.fn().mockResolvedValue(undefined),
    hover: vi.fn().mockResolvedValue(undefined),
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
    waitForFunction: vi.fn().mockResolvedValue(undefined),
    mouse: { wheel: vi.fn().mockResolvedValue(undefined) },
    evaluate: vi.fn().mockImplementation(() => {
      const response = evaluateResponses[i++] ?? [];
      return response instanceof Error ? Promise.reject(response) : Promise.resolve(response);
    }),
  } as unknown as Page;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("scrapeLinkedInJobs", () => {
  it("hovers a job card so wheel scrolling targets the job-list panel", async () => {
    const page = makePage([[makeJob("1")], [], [], details("description 1")]);

    await scrapeLinkedInJobs(page, criteria, noKnownUrls);

    expect(vi.mocked(page.hover)).toHaveBeenCalledWith(
      "[data-occludable-job-id]",
      expect.objectContaining({ timeout: 5000 })
    );
  });

  it("includes the past-week f_TPR and single work-type f_WT filters in the search URL", async () => {
    // Empty first page: 2 stable extractCards rounds, then pagination stops
    const page = makePage([[], []]);

    await scrapeLinkedInJobs(page, criteria, noKnownUrls);

    const [firstUrl] = vi.mocked(page.goto).mock.calls[0] ?? [];
    expect(firstUrl).toContain("f_TPR=r604800");
    expect(firstUrl).toContain("f_WT=1");
  });

  it("runs one search per work type and stamps jobs with the searched type", async () => {
    const multiType: SearchCriteria = {
      ...criteria,
      locations: [{ location: "Remote", workTypes: ["remote", "hybrid"] }],
    };
    const page = makePage([
      [makeJob("1")],
      [],
      [], // remote search, page 0
      details("remote job"),
      [], // remote search, page 1: empty → stop
      [],
      [makeJob("2")],
      [],
      [], // hybrid search, page 0
      details("hybrid job"),
    ]);

    const results = await scrapeLinkedInJobs(page, multiType, noKnownUrls);

    const visitedUrls = vi.mocked(page.goto).mock.calls.map(([url]) => String(url));
    expect(visitedUrls.some((url) => url.includes("f_WT=2"))).toBe(true);
    expect(visitedUrls.some((url) => url.includes("f_WT=3"))).toBe(true);
    expect(results).toHaveLength(2);
    expect(results[0]?.workplaceType).toBe("remote");
    expect(results[1]?.workplaceType).toBe("hybrid");
  });

  it("skips already-stored jobs without fetching their details", async () => {
    const knownUrls = new Set(["https://www.linkedin.com/jobs/view/2/"]);
    // scrapeJobsPage needs 3 extractCards calls per page (1 with data + 2 stable rounds)
    const page = makePage([
      [makeJob("1"), makeJob("2")],
      [],
      [], // page 0: both cards, then 2 stable
      details("description 1"), // fetchJobDetails for job1 only (job2 already stored)
    ]);

    const results = await scrapeLinkedInJobs(page, criteria, knownUrls);

    expect(results).toHaveLength(1);
    expect(results[0]?.url).toBe("https://www.linkedin.com/jobs/view/1/");
    const visitedUrls = vi.mocked(page.goto).mock.calls.map(([url]) => url);
    expect(visitedUrls).not.toContain("https://www.linkedin.com/jobs/view/2/");
  });

  it("retries fetchJobDetails once and uses the second attempt's result", async () => {
    const page = makePage([
      [makeJob("1")],
      [],
      [], // page 0
      new Error("timeout"), // first fetchJobDetails attempt fails
      details("recovered"), // retry succeeds
    ]);

    const results = await scrapeLinkedInJobs(page, criteria, noKnownUrls);

    expect(results).toHaveLength(1);
    expect(results[0]?.description).toBe("recovered");
  });

  it("keeps the job with empty details when fetchJobDetails fails twice", async () => {
    const page = makePage([
      [makeJob("1")],
      [],
      [], // page 0
      new Error("timeout"), // first attempt
      new Error("timeout"), // retry also fails → fallback details, job still kept
    ]);

    const results = await scrapeLinkedInJobs(page, criteria, noKnownUrls);

    expect(results).toHaveLength(1);
    expect(results[0]?.description).toBe("");
    expect(results[0]?.workplaceType).toBe("on-site");
  });

  it("strips ' with verification' suffix from job titles", async () => {
    const jobWithBadge = { ...makeJob("1"), title: "Senior Engineer with verification" };
    const page = makePage([[jobWithBadge], [], [], details("description 1")]);

    const results = await scrapeLinkedInJobs(page, criteria, noKnownUrls);

    expect(results[0]?.title).toBe("Senior Engineer");
  });

  it("deduplicates the same URL appearing on multiple pages", async () => {
    const page = makePage([
      [makeJob("1")],
      [],
      [], // page 0
      details("description 1"), // fetchJobDetails for job1
      [makeJob("1")],
      [],
      [], // page 1: same URL → skipped by seen Set in scrapeLinkedInJobs
    ]);

    const results = await scrapeLinkedInJobs(page, criteria, noKnownUrls);

    expect(results).toHaveLength(1);
  });

  it("stops paginating at maxPages even when pages keep returning jobs", async () => {
    const page = makePage([
      [makeJob("1")],
      [],
      [], // page 0
      details("description 1"), // fetchJobDetails for job1
    ]);

    const results = await scrapeLinkedInJobs(page, criteria, noKnownUrls, 1);

    expect(results).toHaveLength(1);
    const visitedUrls = vi.mocked(page.goto).mock.calls.map(([url]) => String(url));
    expect(visitedUrls.some((url) => url.includes("start=25"))).toBe(false);
  });

  it("skips jobs whose title matches an excluded keyword", async () => {
    const page = makePage([
      [makeJob("1"), { ...makeJob("2"), title: "Java Developer" }],
      [],
      [], // page 0
      details("description 1"), // only job1 gets fetchJobDetails (java job excluded before fetch)
    ]);

    const results = await scrapeLinkedInJobs(
      page,
      { ...criteria, excludeKeywords: ["java"] },
      noKnownUrls
    );

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
