import { describe, expect, it } from "vitest";
import {
  SEARCH_SCHEDULE_DEFAULTS,
  buildSearchCronPattern,
  isValidTimeZone,
} from "./search-schedule";

describe("buildSearchCronPattern", () => {
  it("builds the default pattern (every 4h, 9-17, every day)", () => {
    expect(buildSearchCronPattern(SEARCH_SCHEDULE_DEFAULTS)).toBe("0 9-17/4 * * 0,1,2,3,4,5,6");
  });

  it("emits a single hour when start and end are equal", () => {
    expect(
      buildSearchCronPattern({ intervalHours: 2, startHour: 9, endHour: 9, days: [1, 3] })
    ).toBe("0 9 * * 1,3");
  });

  it("sorts and dedupes days", () => {
    expect(
      buildSearchCronPattern({
        intervalHours: 4,
        startHour: 8,
        endHour: 20,
        days: [5, 1, 5, 0],
      })
    ).toBe("0 8-20/4 * * 0,1,5");
  });
});

describe("isValidTimeZone", () => {
  it("accepts a valid IANA timezone", () => {
    expect(isValidTimeZone("America/Toronto")).toBe(true);
  });

  it("rejects an invalid timezone", () => {
    expect(isValidTimeZone("Not/AZone")).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(isValidTimeZone("")).toBe(false);
  });
});
