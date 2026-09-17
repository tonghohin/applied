import { z } from "zod";

const GITHUB_RELEASES_URL = "https://api.github.com/repos/tonghohin/applied/releases/latest";
const CACHE_TTL_MS = 30 * 60 * 1000;

const githubReleaseSchema = z.object({
  tag_name: z.string(),
});

let cachedVersion: string | null = null;
let cachedAt = 0;

export async function getLatestReleaseVersion(): Promise<string | null> {
  const isCacheFresh = Date.now() - cachedAt < CACHE_TTL_MS;
  if (isCacheFresh) return cachedVersion;

  try {
    const response = await fetch(GITHUB_RELEASES_URL, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "applied-app",
      },
    });
    if (!response.ok) return cachedVersion;

    const release = githubReleaseSchema.parse(await response.json());
    cachedVersion = release.tag_name;
    cachedAt = Date.now();
    return cachedVersion;
  } catch {
    return cachedVersion;
  }
}
