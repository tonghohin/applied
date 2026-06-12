import {
  type Db,
  getJobCriteriaForUser,
  getJobUrlsForUser,
  insertJobs,
  updateSearchRun,
} from "@repo/db";
import type { Browser, BrowserContext, BrowserContextOptions, Page } from "playwright";
import { browserManager } from "./browser";
import { loginToLinkedIn } from "./linkedin/login";
import { scrapeLinkedInJobs } from "./linkedin/scraper";
import { scoreJob } from "./scorer";
import { launchStealthBrowser, stealthContextOptions, stealthPatch } from "./stealth";

type StorageState = NonNullable<BrowserContextOptions["storageState"]>;

async function manualHeadedLogin(): Promise<string> {
  console.log(
    "[linkedin] CAPTCHA detected — opening browser for manual login. Complete the login and the run will continue automatically."
  );
  const headedBrowser = await launchStealthBrowser();
  try {
    const ctx = await headedBrowser.newContext(stealthContextOptions);
    const pg = await ctx.newPage();
    await pg.addInitScript(stealthPatch);
    await pg.goto("https://www.linkedin.com/login", { waitUntil: "domcontentloaded" });
    await pg.waitForURL("**/feed**", { timeout: 5 * 60 * 1000 });
    return JSON.stringify(await ctx.storageState());
  } finally {
    await headedBrowser.close();
  }
}

async function loginOrManual(
  browser: Browser,
  email: string,
  password: string
): Promise<{ context: BrowserContext; page: Page; newSessionJson: string }> {
  const context = await browser.newContext(stealthContextOptions);
  const page = await context.newPage();
  await page.addInitScript(stealthPatch);

  try {
    await loginToLinkedIn(page, email, password);
    return { context, page, newSessionJson: JSON.stringify(await context.storageState()) };
  } catch (err) {
    if (err instanceof Error && err.message.toLowerCase().includes("captcha")) {
      await context.close();
      const newSessionJson = await manualHeadedLogin();
      const restoredContext = await browser.newContext({
        ...stealthContextOptions,
        storageState: JSON.parse(newSessionJson) as StorageState,
      });
      const restoredPage = await restoredContext.newPage();
      await restoredPage.addInitScript(stealthPatch);
      return { context: restoredContext, page: restoredPage, newSessionJson };
    }
    throw err;
  }
}

export async function runSearch(
  db: Db,
  userId: string,
  email: string,
  password: string,
  runId: string,
  existingSessionJson?: string,
  options?: { maxPages?: number }
): Promise<{ jobCount: number; newSessionJson: string | null }> {
  const criteriaRow = await getJobCriteriaForUser(db, userId);
  if (!criteriaRow) throw new Error("No job criteria found");

  await updateSearchRun(db, runId, {
    status: "running",
    searchCriteria: {
      jobTitle: criteriaRow.jobTitle,
      skills: criteriaRow.skills,
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
      ({ context, page, newSessionJson } = await loginOrManual(browser, email, password));
    } else {
      await page.waitForTimeout(1500 + Math.random() * 1500);
      await page.mouse.wheel(0, 400);
      await page.waitForTimeout(800 + Math.random() * 600);
    }
  } else {
    ({ context, page, newSessionJson } = await loginOrManual(browser, email, password));
  }

  try {
    const knownUrls = new Set(await getJobUrlsForUser(db, userId));
    const scraped = await scrapeLinkedInJobs(
      page,
      {
        jobTitle: criteriaRow.jobTitle,
        locations: criteriaRow.locations,
        excludeKeywords: criteriaRow.excludeKeywords,
        excludeCompanies: criteriaRow.excludeCompanies,
      },
      knownUrls,
      options?.maxPages
    );

    if (scraped.length === 0) return { jobCount: 0, newSessionJson };

    const jobCount = await insertJobs(
      db,
      scraped.map((job) => ({
        userId,
        runId,
        title: job.title,
        company: job.company,
        location: job.location,
        description: job.description,
        url: job.url,
        platform: job.platform,
        workplaceType: job.workplaceType,
        fitTier: scoreJob(job, { jobTitle: criteriaRow.jobTitle, skills: criteriaRow.skills }),
        createdAt: new Date(),
        updatedAt: new Date(),
      }))
    );
    return { jobCount, newSessionJson };
  } finally {
    await context.close();
  }
}
