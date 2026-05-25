import { type Db, getJobCriteriaForUser, insertJobs } from "@repo/db";
import { browserManager } from "./browser";
import { loginToLinkedIn } from "./linkedin/login";
import { scrapeLinkedInJobs } from "./linkedin/scraper";
import { scoreJob } from "./scorer";

export async function runSearch(db: Db, userId: string, email: string, password: string) {
  const criteriaRow = await getJobCriteriaForUser(db, userId);
  if (!criteriaRow) throw new Error("No job criteria found");

  const browser = await browserManager.getBrowser();
  const page = await browser.newPage();

  try {
    await loginToLinkedIn(page, email, password);

    const scraped = await scrapeLinkedInJobs(page, {
      jobTitles: criteriaRow.jobTitles,
      locations: criteriaRow.locations,
    });

    if (scraped.length === 0) return;

    await insertJobs(
      db,
      scraped.map((job) => ({
        userId,
        title: job.title,
        company: job.company,
        location: job.location,
        description: job.description,
        url: job.url,
        platform: job.platform,
        fitTier: scoreJob(job, { jobTitles: criteriaRow.jobTitles, skills: criteriaRow.skills }),
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
    );
  } finally {
    await page.close();
  }
}
