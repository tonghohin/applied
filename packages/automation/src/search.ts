import {
  type Db,
  getJobCriteriaForUser,
  getLatestListedAtForUser,
  insertJobs,
  updateSearchRun,
} from "@repo/db";
import { browserManager } from "./browser";
import { loginToLinkedIn } from "./linkedin/login";
import { scrapeLinkedInJobs } from "./linkedin/scraper";
import { scoreJob } from "./scorer";

export async function runSearch(
  db: Db,
  userId: string,
  email: string,
  password: string,
  runId: string
): Promise<number> {
  const criteriaRow = await getJobCriteriaForUser(db, userId);
  if (!criteriaRow) throw new Error("No job criteria found");

  await updateSearchRun(db, runId, {
    status: "running",
    searchCriteria: {
      jobTitles: criteriaRow.jobTitles,
      skills: criteriaRow.skills,
      locations: criteriaRow.locations,
    },
  });

  const browser = await browserManager.getBrowser();
  const page = await browser.newPage();

  try {
    await loginToLinkedIn(page, email, password);

    const sinceDate = await getLatestListedAtForUser(db, userId);

    const scraped = await scrapeLinkedInJobs(
      page,
      { jobTitles: criteriaRow.jobTitles, locations: criteriaRow.locations },
      sinceDate ?? undefined
    );

    if (scraped.length === 0) return 0;

    await insertJobs(
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
        fitTier: scoreJob(job, { jobTitles: criteriaRow.jobTitles, skills: criteriaRow.skills }),
        listedAt: new Date(job.listedAt),
        createdAt: new Date(),
        updatedAt: new Date(),
      }))
    );

    return scraped.length;
  } finally {
    await page.close();
  }
}
