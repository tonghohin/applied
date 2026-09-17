import {
  type Db,
  getJobCriteriaForUser,
  getJobIdentitiesForUser,
  getJobUrlsForUser,
  insertJobs,
  updateSearchRun,
} from "@repo/db";
import type { Browser, BrowserContext, BrowserContextOptions, Page } from "playwright";
import { browserManager } from "./browser";
import { loginToLinkedIn } from "./linkedin/login";
import { identityKey, scrapeLinkedInJobs } from "./linkedin/scraper";
import { stealthContextOptions, stealthPatch } from "./stealth";
import type { ScrapedJob } from "./types";

type StorageState = NonNullable<BrowserContextOptions["storageState"]>;

// If LinkedIn throws a captcha/checkpoint, this just fails — the caller
// (search.worker.ts) marks the run failed and clears the stored session so
// the next attempt starts fresh.
async function login(
  browser: Browser,
  email: string,
  password: string
): Promise<{ context: BrowserContext; page: Page; newSessionJson: string }> {
  const context = await browser.newContext(stealthContextOptions);
  const page = await context.newPage();
  await page.addInitScript(stealthPatch);
  await loginToLinkedIn(page, email, password);
  return { context, page, newSessionJson: JSON.stringify(await context.storageState()) };
}

export async function runSearch(
  db: Db,
  userId: string,
  email: string,
  password: string,
  runId: string,
  scoreJob: (job: ScrapedJob) => Promise<number>,
  existingSessionJson?: string,
  options?: { maxPages?: number }
): Promise<{ jobCount: number; newSessionJson: string | null }> {
  const criteriaRow = await getJobCriteriaForUser(db, userId);
  if (!criteriaRow) throw new Error("No job criteria found");

  await updateSearchRun(db, runId, {
    status: "running",
    searchCriteria: {
      jobTitle: criteriaRow.jobTitle,
      locations: criteriaRow.locations,
    },
  });

  const browser = await browserManager.getBrowser();

  let newSessionJson: string | null = null;
  let context: BrowserContext;
  let page: Page;

  if (existingSessionJson) {
    context = await browser.newContext({
      ...stealthContextOptions,
      storageState: JSON.parse(existingSessionJson) as StorageState,
    });
    page = await context.newPage();
    await page.addInitScript(stealthPatch);
    await page.goto("https://www.linkedin.com/feed", { waitUntil: "domcontentloaded" });

    if (!page.url().includes("/feed")) {
      await context.close();
      ({ context, page, newSessionJson } = await login(browser, email, password));
    } else {
      await page.waitForTimeout(1500 + Math.random() * 1500);
      await page.mouse.wheel(0, 400);
      await page.waitForTimeout(800 + Math.random() * 600);
    }
  } else {
    ({ context, page, newSessionJson } = await login(browser, email, password));
  }

  try {
    const [knownUrlsList, knownIdentitiesList] = await Promise.all([
      getJobUrlsForUser(db, userId),
      getJobIdentitiesForUser(db, userId),
    ]);
    const knownUrls = new Set(knownUrlsList);
    const knownIdentities = new Set(
      knownIdentitiesList.map((row) => identityKey(row.company, row.title, row.location))
    );
    const scraped = await scrapeLinkedInJobs(
      page,
      {
        jobTitle: criteriaRow.jobTitle,
        locations: criteriaRow.locations,
        excludeKeywords: criteriaRow.excludeKeywords,
        excludeCompanies: criteriaRow.excludeCompanies,
        skipDuplicateIdentity: criteriaRow.skipDuplicateIdentity,
      },
      knownUrls,
      knownIdentities,
      options?.maxPages
    );

    if (scraped.length === 0) return { jobCount: 0, newSessionJson };

    const scores = await Promise.all(scraped.map((job) => scoreJob(job)));

    const jobCount = await insertJobs(
      db,
      scraped.map((job, index) => ({
        userId,
        runId,
        title: job.title,
        company: job.company,
        location: job.location,
        description: job.description,
        url: job.url,
        platform: job.platform,
        workplaceType: job.workplaceType,
        score: scores[index],
        createdAt: new Date(),
        updatedAt: new Date(),
      }))
    );
    return { jobCount, newSessionJson };
  } finally {
    await context.close();
  }
}
