import { describe, expect, it } from "vitest";
import { formatAppliedBeforeText } from "./applied-before";

describe("formatAppliedBeforeText", () => {
  it("returns null when there is no prior history", () => {
    expect(formatAppliedBeforeText(0)).toBeNull();
  });

  it("describes a single prior application", () => {
    expect(formatAppliedBeforeText(1)).toBe("Applied here once before");
  });

  it("describes multiple prior applications", () => {
    expect(formatAppliedBeforeText(3)).toBe("Applied here 3x before");
  });
});
