import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { getLatestReleaseVersion as GetLatestReleaseVersion } from "./version.service";

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: () => Promise.resolve(body) } as Response;
}

async function importFreshService(): Promise<{
  getLatestReleaseVersion: typeof GetLatestReleaseVersion;
}> {
  vi.resetModules();
  return import("./version.service");
}

describe("getLatestReleaseVersion", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("returns the tag_name on success", async () => {
    const { getLatestReleaseVersion } = await importFreshService();
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ tag_name: "v1.2.3" }));

    const version = await getLatestReleaseVersion();

    expect(version).toBe("v1.2.3");
  });

  it("does not refetch within the cache TTL", async () => {
    const { getLatestReleaseVersion } = await importFreshService();
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ tag_name: "v1.2.3" }));
    await getLatestReleaseVersion();

    const version = await getLatestReleaseVersion();

    expect(version).toBe("v1.2.3");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("falls back to the cached value when a later fetch fails", async () => {
    const { getLatestReleaseVersion } = await importFreshService();
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ tag_name: "v1.2.3" }));
    await getLatestReleaseVersion();
    vi.advanceTimersByTime(31 * 60 * 1000);
    vi.mocked(fetch).mockRejectedValueOnce(new Error("network error"));

    const version = await getLatestReleaseVersion();

    expect(version).toBe("v1.2.3");
  });

  it("returns null when it has never fetched successfully", async () => {
    const { getLatestReleaseVersion } = await importFreshService();
    vi.mocked(fetch).mockRejectedValueOnce(new Error("network error"));

    const version = await getLatestReleaseVersion();

    expect(version).toBeNull();
  });
});
