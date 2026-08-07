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
    // LinkedIn's own upsell widgets (e.g. the "Reactivate Premium" card) can outsize the
    // real description while it's still loading, or sit in a plain <section> that would
    // otherwise win the fallback below — this copy is specific enough to LinkedIn's own
    // marketing that it should never appear in an employer's job description. Kept as a
    // plain regex (not a named helper function): Playwright serializes this callback via
    // Function.prototype.toString() to run it in the page, and tsx compiles with esbuild's
    // `keepNames`, which wraps named function bindings in a `__name()` call that doesn't
    // exist in that isolated page context, throwing at runtime.
    const promoPattern =
      /reactivate premium|job search smarter with premium|cancel anytime\. no hidden fees\.|other members use premium/i;

    // Sidebar/rail modules ("More jobs for you", "People also viewed", the company's
    // "Employees at X" feed of recent posts, etc.) can outsize the real description while
    // it's still lazy-loading, especially right after `domcontentloaded` when the rail
    // (simpler markup) has rendered but the JD panel hasn't. Rather than enumerate every
    // widget by name (there will always be another one), key off two widget-agnostic tells
    // shared by all of them: each listing repeats a "Posted X ago" caption, and — since these
    // are rails of repeated card units (byline, connection degree, timestamp, reactions) —
    // they're strung together with standalone "•"/"·" divider characters. A real job
    // description is prose and essentially never contains an isolated divider character
    // (surrounded by whitespace) more than once or twice, nor "Posted X ago" more than once.
    // Inlined as regex tests (not named helpers) for the same __name/keepNames reason as
    // above — no assignable binding here, just plain regex literals.
    const jobListPostedPattern = /posted\s+\d+\s+(?:hour|day|week|month)s?\s+ago/gi;
    const standaloneDividerPattern = /(?:^|\s)[•·](?:\s|$)/g;

    // Primary: LinkedIn usually wraps the description with an "About the job" header
    const aboutJobEl = Array.from(document.querySelectorAll("div, section, article")).find((el) => {
      const text = el.textContent?.trim() ?? "";
      return (
        text.startsWith("About the job") &&
        text.length > 100 &&
        text.length < 8000 &&
        !promoPattern.test(text) &&
        !/^more jobs\b/i.test(text) &&
        (text.match(jobListPostedPattern)?.length ?? 0) < 2 &&
        (text.match(standaloneDividerPattern)?.length ?? 0) < 3
      );
    });

    // Fallback: biggest bounded <section> (excludes nav/footer). If no section qualifies
    // (e.g. the layout wraps the description in a plain <div> instead), widen the search
    // as a second pass rather than unioning the tag list upfront, so a large wrapping
    // <div>/<article> can't outrank the right <section> by including more surrounding
    // chrome while still sneaking under the length cap. Duplicated inline (rather than
    // factored into a shared named helper) for the same __name/keepNames reason as above.
    const descriptionRoot =
      aboutJobEl ??
      Array.from(document.querySelectorAll("section"))
        .map((element) => ({ element, text: element.textContent?.trim() ?? "" }))
        .filter(
          ({ text }) =>
            text.length > 200 &&
            text.length < 10000 &&
            !promoPattern.test(text) &&
            !/^more jobs\b/i.test(text) &&
            (text.match(jobListPostedPattern)?.length ?? 0) < 2 &&
            (text.match(standaloneDividerPattern)?.length ?? 0) < 3
        )
        .sort((a, b) => b.text.length - a.text.length)[0]?.element ??
      Array.from(document.querySelectorAll("div, article"))
        .map((element) => ({ element, text: element.textContent?.trim() ?? "" }))
        .filter(
          ({ text }) =>
            text.length > 200 &&
            text.length < 10000 &&
            !promoPattern.test(text) &&
            !/^more jobs\b/i.test(text) &&
            (text.match(jobListPostedPattern)?.length ?? 0) < 2 &&
            (text.match(standaloneDividerPattern)?.length ?? 0) < 3
        )
        .sort((a, b) => b.text.length - a.text.length)[0]?.element;

    if (!descriptionRoot) return { description: "" };

    // Converts block-level DOM structure (paragraphs, line breaks, list items) into
    // newlines/bullets so the stored text isn't one run-on line — textContent alone
    // collapses everything flat. Written as an explicit stack instead of recursion through
    // a nested named helper: Playwright serializes this callback via
    // Function.prototype.toString() to run it in the page, and tsx compiles with esbuild's
    // `keepNames`, which wraps nested named functions in a `__name()` call that doesn't
    // exist in that isolated page context, throwing at runtime.
    const blockTags = new Set([
      "P",
      "DIV",
      "SECTION",
      "ARTICLE",
      "UL",
      "OL",
      "H1",
      "H2",
      "H3",
      "H4",
      "H5",
      "H6",
    ]);
    const frames: Array<{ node: Element; children: ChildNode[]; index: number; acc: string }> = [
      {
        node: descriptionRoot,
        children: Array.from(descriptionRoot.childNodes),
        index: 0,
        acc: "",
      },
    ];
    let description = "";
    while (frames.length > 0) {
      const frame = frames[frames.length - 1];
      if (!frame) break;
      if (frame.index < frame.children.length) {
        const child = frame.children[frame.index];
        frame.index += 1;
        if (!child) continue;
        if (child.nodeType === Node.TEXT_NODE) {
          const text = child.textContent ?? "";
          // Whitespace-only text nodes containing a newline are pretty-printing artifacts
          // between tags, not intentional line breaks — drop them so they don't inject
          // blank lines. Whitespace-only text without a newline (e.g. a space between
          // inline elements) is a real separator, so normalize it to a single space.
          frame.acc += text.trim() === "" ? (text.includes("\n") ? "" : " ") : text;
        } else if (child instanceof Element) {
          if (child.tagName === "BR") {
            frame.acc += "\n";
          } else if (child.tagName === "BUTTON" || child.getAttribute("aria-hidden") === "true") {
            // Skip UI controls like LinkedIn's "…more" truncation toggle — the full text is
            // already present as a sibling/ancestor in the DOM, so the toggle's own label
            // would otherwise get appended to the end of the description.
          } else {
            frames.push({ node: child, children: Array.from(child.childNodes), index: 0, acc: "" });
          }
        }
        continue;
      }
      frames.pop();
      let value = frame.acc;
      if (frame.node.tagName === "LI") {
        value = `• ${value.trim()}\n`;
      } else if (blockTags.has(frame.node.tagName)) {
        // Leading and trailing separators (not just trailing) so a block element that
        // directly follows inline text/another block doesn't get glued to it — the excess
        // newlines this creates between adjacent blocks are collapsed below.
        value = `\n\n${value.trim()}\n\n`;
      }
      const parentFrame = frames[frames.length - 1];
      if (parentFrame) {
        parentFrame.acc += value;
      } else {
        description = value;
      }
    }

    description = description
      .replace(/[ \t]+/g, " ")
      .split("\n")
      .map((line) => line.trim())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

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
