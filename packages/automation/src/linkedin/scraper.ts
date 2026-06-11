/// <reference lib="dom" />
import { type WorkType, isExcluded } from "@repo/shared";
import type { Page } from "playwright";
import type { ScrapedJob, SearchCriteria } from "../types";

const MAX_PAGES = 5;
const randomDelay = () => Math.floor(Math.random() * 2000) + 1500;
const CUTOFF_MS = 7 * 24 * 60 * 60 * 1000;

const WT_MAP: Record<WorkType, string> = {
  "on-site": "1",
  remote: "2",
  hybrid: "3",
};

function buildSearchUrl(jobTitle: string, location: string, workTypes: WorkType[]): string {
  const f_WT = workTypes
    .map((w) => WT_MAP[w])
    .filter(Boolean)
    .join(",");
  const params = new URLSearchParams({ keywords: jobTitle, location, sortBy: "DD" });
  if (f_WT) params.set("f_WT", f_WT);
  return `https://www.linkedin.com/jobs/search/?${params.toString()}`;
}

function extractCards() {
  const cards = Array.from(document.querySelectorAll("[data-occludable-job-id]"));
  return cards
    .map((card) => {
      const linkEl = card.querySelector("a.job-card-container__link");
      const companyEl = card.querySelector(".artdeco-entity-lockup__subtitle");
      const locationEl = card.querySelector(".artdeco-entity-lockup__caption");
      const jobId = card.getAttribute("data-occludable-job-id");
      const timeEl = card.querySelector("time[datetime]");
      return {
        title: linkEl?.getAttribute("aria-label") ?? linkEl?.textContent?.trim() ?? "",
        company: companyEl?.textContent?.trim() ?? "",
        location: (locationEl?.textContent?.trim() ?? "")
          .replace(/\s*[·•]\s*(remote|hybrid|on-site|onsite)\s*$/i, "")
          .replace(/\s*\((remote|hybrid|on-site|onsite)\)\s*$/i, "")
          .trim(),
        url: jobId ? `https://www.linkedin.com/jobs/view/${jobId}/` : "",
        description: "",
        platform: "linkedin" as const,
        listedAt:
          timeEl !== null
            ? (timeEl.getAttribute("datetime") ?? new Date().toISOString())
            : new Date().toISOString(),
      };
    })
    .filter((j) => j.title && j.url);
}

async function scrapeJobsPage(
  page: Page
): Promise<Omit<ScrapedJob, "workplaceType" | "externalApplyUrl">[]> {
  const seen = new Map<string, ReturnType<typeof extractCards>[number]>();

  let stableRounds = 0;
  while (stableRounds < 3) {
    const cards = await page.evaluate(extractCards);
    let newCards = 0;
    for (const card of cards) {
      if (!seen.has(card.url)) {
        seen.set(card.url, card);
        newCards++;
      }
    }

    if (newCards === 0) {
      stableRounds++;
    } else {
      stableRounds = 0;
    }
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(600);
  }

  return Array.from(seen.values()).map((job) => ({
    ...job,
    title: job.title.replace(/ with verification$/i, "").trim(),
  }));
}

async function gotoWithRetry(page: Page, url: string): Promise<void> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
      return;
    } catch (err) {
      if (attempt < 3 && String(err).includes("interrupted by another navigation")) {
        await page.waitForTimeout(attempt * 1500);
        continue;
      }
      throw err;
    }
  }
}

async function fetchJobDetails(
  page: Page,
  url: string
): Promise<{ description: string; workplaceType: WorkType; externalApplyUrl: string | null }> {
  await gotoWithRetry(page, url);
  await page.waitForTimeout(randomDelay());
  return page.evaluate(() => {
    // Primary: LinkedIn usually wraps the description with an "About the job" header
    const aboutJobEl = Array.from(document.querySelectorAll("div, section, article")).find((el) => {
      const text = el.textContent?.trim() ?? "";
      return text.startsWith("About the job") && text.length > 100 && text.length < 8000;
    });
    const description = aboutJobEl
      ? (aboutJobEl.textContent?.trim() ?? "")
      : (() => {
          // Fallback: biggest bounded section (excludes nav/footer)
          const sections = Array.from(document.querySelectorAll("section"));
          return (
            sections
              .map((section) => section.textContent?.trim() ?? "")
              .filter((text) => text.length > 200 && text.length < 10000)
              .sort((a, b) => b.length - a.length)[0] ?? ""
          );
        })();

    // Extract workplace type — JSON-LD is reliable for remote; leaf-element scan covers hybrid
    let workplaceType: WorkType = "on-site";
    let externalApplyUrl: string | null = null;
    try {
      const jsonLdEl = document.querySelector('script[type="application/ld+json"]');
      if (jsonLdEl) {
        const data = JSON.parse(jsonLdEl.textContent ?? "{}");
        if (data.jobLocationType === "TELECOMMUTE") workplaceType = "remote";
        // LinkedIn includes applicationContact.url for external apply jobs in JSON-LD
        const appUrl = data?.applicationContact?.url ?? data?.applicationUrl ?? null;
        if (typeof appUrl === "string" && !appUrl.includes("linkedin.com")) {
          externalApplyUrl = appUrl;
        }
      }
    } catch {}

    if (workplaceType === "on-site") {
      const exactMatch: Record<string, WorkType> = {
        remote: "remote",
        hybrid: "hybrid",
        "on-site": "on-site",
        onsite: "on-site",
      };
      for (const el of Array.from(document.querySelectorAll("span, li"))) {
        if (el.children.length > 0) continue;
        const text = (el.textContent?.trim() ?? "").toLowerCase();
        if (text in exactMatch) {
          workplaceType = exactMatch[text] ?? "on-site";
          break;
        }
      }
    }

    // Fallback: look for a direct non-LinkedIn link labelled as an apply action
    if (!externalApplyUrl) {
      for (const anchor of Array.from(
        document.querySelectorAll("a[href]")
      ) as HTMLAnchorElement[]) {
        const label = (anchor.getAttribute("aria-label") ?? anchor.textContent ?? "").toLowerCase();
        const href = anchor.href ?? "";
        if (/apply/.test(label) && href && !href.includes("linkedin.com")) {
          externalApplyUrl = href;
          break;
        }
      }
    }

    return { description, workplaceType, externalApplyUrl };
  });
}

export async function scrapeLinkedInJobs(
  page: Page,
  criteria: SearchCriteria,
  sinceDate?: Date
): Promise<ScrapedJob[]> {
  const results: ScrapedJob[] = [];
  const seen = new Set<string>();
  const effectiveCutoff = sinceDate ?? new Date(Date.now() - CUTOFF_MS);

  let locIdx = 0;
  for (const locationEntry of criteria.locations) {
    if (locIdx++ > 0) await page.waitForTimeout(5000 + Math.random() * 3000);
    const searchUrl = buildSearchUrl(
      criteria.jobTitle,
      locationEntry.location,
      locationEntry.workTypes
    );
    for (let pageNum = 0; pageNum < MAX_PAGES; pageNum++) {
      const url = pageNum === 0 ? searchUrl : `${searchUrl}&start=${pageNum * 25}`;
      await gotoWithRetry(page, url);
      await page.waitForTimeout(randomDelay());

      const jobs = await scrapeJobsPage(page);
      if (jobs.length === 0) break;

      for (const job of jobs) {
        if (job.listedAt && new Date(job.listedAt) < effectiveCutoff) {
          continue;
        }
        if (seen.has(job.url)) continue;
        seen.add(job.url);

        if (isExcluded(job.title, criteria.excludeKeywords)) {
          continue;
        }

        let details: {
          description: string;
          workplaceType: WorkType;
          externalApplyUrl: string | null;
        } = {
          description: "",
          workplaceType: "on-site",
          externalApplyUrl: null,
        };
        try {
          details = await fetchJobDetails(page, job.url);
        } catch (err) {
          console.error(`Failed to fetch details for ${job.url}:`, err);
        }

        if (!locationEntry.workTypes.includes(details.workplaceType)) {
          continue;
        }

        results.push({ ...job, ...details });
      }
    }
  }

  return results;
}
