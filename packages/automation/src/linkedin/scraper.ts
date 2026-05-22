/// <reference lib="dom" />
import type { Page } from "playwright";
import type { ScrapedJob, SearchCriteria } from "../types.js";

const DELAY_MS = 1500;

function buildSearchUrl(jobTitle: string, location: string, remote: boolean): string {
  const params = new URLSearchParams({
    keywords: jobTitle,
    location: location,
    ...(remote ? { f_WT: "2" } : {}),
  });
  return `https://www.linkedin.com/jobs/search/?${params.toString()}`;
}

async function scrapeJobsPage(page: Page): Promise<ScrapedJob[]> {
  return page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll(".jobs-search-results__list-item"));
    return cards
      .map((card) => {
        const titleEl = card.querySelector(".job-card-list__title, .job-card-container__link");
        const companyEl = card.querySelector(
          ".job-card-container__primary-description, .artdeco-entity-lockup__subtitle"
        );
        const locationEl = card.querySelector(".job-card-container__metadata-item");
        const linkEl = card.querySelector("a[href*='/jobs/view/']");

        return {
          title: titleEl?.textContent?.trim() ?? "",
          company: companyEl?.textContent?.trim() ?? "",
          location: locationEl?.textContent?.trim() ?? "",
          url: linkEl instanceof HTMLAnchorElement ? linkEl.href : "",
          description: "",
          platform: "linkedin" as const,
        };
      })
      .filter((j) => j.title && j.url);
  });
}

async function fetchDescription(page: Page, url: string): Promise<string> {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(DELAY_MS);
  return page.evaluate(() => {
    const el = document.querySelector(".jobs-description__content, .job-view-layout");
    return el?.textContent?.trim() ?? "";
  });
}

export async function scrapeLinkedInJobs(
  page: Page,
  criteria: SearchCriteria
): Promise<ScrapedJob[]> {
  const results: ScrapedJob[] = [];
  const seen = new Set<string>();

  for (const jobTitle of criteria.jobTitles.slice(0, 2)) {
    const location = criteria.locations[0] ?? "Remote";
    const searchUrl = buildSearchUrl(jobTitle, location, criteria.remote);

    for (let pageNum = 0; pageNum < 3; pageNum++) {
      const url = pageNum === 0 ? searchUrl : `${searchUrl}&start=${pageNum * 25}`;
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(DELAY_MS);

      const jobs = await scrapeJobsPage(page);
      if (jobs.length === 0) break;

      for (const job of jobs) {
        if (seen.has(job.url)) continue;
        seen.add(job.url);

        const description = await fetchDescription(page, job.url);
        results.push({ ...job, description });
      }
    }
  }

  return results;
}
