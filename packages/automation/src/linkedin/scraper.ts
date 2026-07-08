/// <reference lib="dom" />
import { type WorkType, isExcluded } from "@repo/shared";
import { secondsInWeek } from "date-fns/constants";
import type { Page } from "playwright";
import type { ScrapedJob, SearchCriteria } from "../types";

const DEFAULT_MAX_PAGES = 5;
const randomDelay = (minMs = 1500, maxMs = 3500) =>
  minMs + Math.floor(Math.random() * (maxMs - minMs));

const WT_MAP: Record<WorkType, string> = {
  "on-site": "1",
  remote: "2",
  hybrid: "3",
};

function buildSearchUrl(jobTitle: string, location: string, workType: WorkType): string {
  const params = new URLSearchParams({
    keywords: jobTitle,
    location,
    sortBy: "DD",
    // LinkedIn's "Date posted: past week" filter
    f_TPR: `r${secondsInWeek}`,
    // Searching one work type at a time makes the filter the source of truth for
    // workplaceType — the job pages themselves don't expose it reliably
    f_WT: WT_MAP[workType],
  });
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
      return {
        title: linkEl?.getAttribute("aria-label") ?? linkEl?.textContent?.trim() ?? "",
        company: (companyEl?.textContent?.trim() ?? "").replace(/\.+$/, ""),
        location: (locationEl?.textContent?.trim() ?? "")
          .replace(/\s*[·•]\s*(remote|hybrid|on-site|onsite)\s*$/i, "")
          .replace(/\s*\((remote|hybrid|on-site|onsite)\)\s*$/i, "")
          .trim(),
        url: jobId ? `https://www.linkedin.com/jobs/view/${jobId}/` : "",
        description: "",
        platform: "linkedin" as const,
      };
    })
    .filter((j) => j.title && j.url);
}

async function scrapeJobsPage(page: Page): Promise<Omit<ScrapedJob, "workplaceType">[]> {
  const seen = new Map<string, ReturnType<typeof extractCards>[number]>();

  // Wheel events fire at the mouse position (0,0 by default), which misses LinkedIn's
  // independently scrollable job-list panel — hover a card first so the list scrolls.
  try {
    await page.hover("[data-occludable-job-id]", { timeout: 5000 });
  } catch {
    // no job cards rendered; the loop below exits after 2 stable rounds
  }

  let stableRounds = 0;
  while (stableRounds < 2) {
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
    // Fast randomized flings — wheel speed on a loaded page is client-side and well
    // within trackpad behavior; only the lazy-load fetches it triggers reach LinkedIn
    await page.mouse.wheel(0, randomDelay(900, 1400));
    await page.waitForTimeout(randomDelay(250, 450));
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

async function fetchJobDetails(page: Page, url: string): Promise<{ description: string }> {
  await gotoWithRetry(page, url);
  // Adaptive wait with a dwell floor: proceed as soon as the description has rendered,
  // but never leave the page before a randomized minimum — per-page dwell time is part
  // of looking human even when the content loads instantly.
  const minDwellMs = randomDelay(1500, 2500);
  const navigatedAt = Date.now();
  await page
    .waitForFunction(() => document.body?.textContent?.includes("About the job") ?? false, {
      timeout: 4000,
    })
    .catch(() => {
      // description never rendered or uses a different layout — extraction below falls back
    });
  const remainingDwellMs = minDwellMs - (Date.now() - navigatedAt);
  if (remainingDwellMs > 0) await page.waitForTimeout(remainingDwellMs);
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

    return { description };
  });
}

export function identityKey(company: string, title: string, location: string): string {
  return `${company.toLowerCase().trim()}|${title.toLowerCase().trim()}|${location.toLowerCase().trim()}`;
}

export async function scrapeLinkedInJobs(
  page: Page,
  criteria: SearchCriteria,
  knownUrls: Set<string>,
  knownIdentities: Set<string>,
  maxPages: number = DEFAULT_MAX_PAGES
): Promise<ScrapedJob[]> {
  const results: ScrapedJob[] = [];
  const seen = new Set<string>();
  const seenIdentities = new Set(knownIdentities);

  let searchIdx = 0;
  for (const locationEntry of criteria.locations) {
    // One search per work type — LinkedIn's f_WT filter is the source of truth for
    // workplaceType, so each result is stamped with the type it was searched under
    for (const workType of locationEntry.workTypes) {
      if (searchIdx++ > 0) await page.waitForTimeout(randomDelay(3000, 5000));
      const searchUrl = buildSearchUrl(criteria.jobTitle, locationEntry.location, workType);
      for (let pageNum = 0; pageNum < maxPages; pageNum++) {
        const url = pageNum === 0 ? searchUrl : `${searchUrl}&start=${pageNum * 25}`;
        await gotoWithRetry(page, url);
        // Short settle only — scrapeJobsPage's scroll loop already waits for cards to render
        await page.waitForTimeout(randomDelay(800, 1500));

        const jobs = await scrapeJobsPage(page);
        if (jobs.length === 0) break;

        for (const job of jobs) {
          if (seen.has(job.url)) continue;
          seen.add(job.url);

          if (knownUrls.has(job.url)) continue;

          // Card captions occasionally omit the location — fall back to the
          // criteria location this search was run under
          const resolvedLocation = job.location || locationEntry.location;
          const jobIdentityKey = identityKey(job.company, job.title, resolvedLocation);
          if (criteria.skipDuplicateIdentity && seenIdentities.has(jobIdentityKey)) continue;
          if (criteria.skipDuplicateIdentity) seenIdentities.add(jobIdentityKey);

          if (isExcluded(job.title, criteria.excludeKeywords)) continue;
          if (isExcluded(job.company, criteria.excludeCompanies)) continue;

          let details: { description: string } = { description: "" };
          for (let attempt = 1; attempt <= 2; attempt++) {
            try {
              details = await fetchJobDetails(page, job.url);
              break;
            } catch (err) {
              if (attempt === 2) {
                console.error(`Failed to fetch details for ${job.url}:`, err);
              }
            }
          }

          results.push({
            ...job,
            ...details,
            location: resolvedLocation,
            workplaceType: workType,
          });
        }
      }
    }
  }

  return results;
}
