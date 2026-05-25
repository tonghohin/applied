/// <reference lib="dom" />
import type { WorkType } from "@repo/shared";
import type { Page } from "playwright";
import type { ScrapedJob, SearchCriteria } from "../types";

const DELAY_MS = 1500;

const WT_MAP: Record<WorkType, string> = { "on-site": "1", remote: "2", hybrid: "3" };

function buildSearchUrl(jobTitle: string, location: string, workTypes: WorkType[]): string {
  const f_WT = workTypes.map((w) => WT_MAP[w]).filter(Boolean).join(",");
  const params = new URLSearchParams({ keywords: jobTitle, location });
  if (f_WT) params.set("f_WT", f_WT);
  return `https://www.linkedin.com/jobs/search/?${params.toString()}`;
}

async function scrapeJobsPage(page: Page): Promise<ScrapedJob[]> {
  return page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll("[data-occludable-job-id]"));
    return cards
      .map((card) => {
        const linkEl = card.querySelector("a.job-card-container__link");
        const companyEl = card.querySelector(".artdeco-entity-lockup__subtitle");
        const locationEl = card.querySelector(".artdeco-entity-lockup__caption");

        return {
          title: linkEl?.getAttribute("aria-label") ?? linkEl?.textContent?.trim() ?? "",
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
    // Primary: LinkedIn usually wraps the description with an "About the job" header
    const aboutJobEl = Array.from(document.querySelectorAll("div, section, article")).find((el) => {
      const text = el.textContent?.trim() ?? "";
      return text.startsWith("About the job") && text.length > 100 && text.length < 8000;
    });
    if (aboutJobEl) return aboutJobEl.textContent?.trim() ?? "";

    // Fallback: biggest bounded section (excludes nav/footer)
    const sections = Array.from(document.querySelectorAll("section"));
    const biggest = sections
      .map((s) => s.textContent?.trim() ?? "")
      .filter((t) => t.length > 200 && t.length < 10000)
      .sort((a, b) => b.length - a.length)[0];
    return biggest ?? "";
  });
}

export async function scrapeLinkedInJobs(
  page: Page,
  criteria: SearchCriteria
): Promise<ScrapedJob[]> {
  const results: ScrapedJob[] = [];
  const seen = new Set<string>();

  for (const jobTitle of criteria.jobTitles.slice(0, 2)) {
    for (const locationEntry of criteria.locations) {
      const searchUrl = buildSearchUrl(jobTitle, locationEntry.location, locationEntry.workTypes);

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
  }

  return results;
}
