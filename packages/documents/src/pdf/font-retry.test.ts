import { afterEach, describe, expect, it, vi } from "vitest";
import { renderResumePdf } from "./resume-pdf";

// Kept in its own file: the failure must happen on the process's first font download, and Vitest
// runs each test file in isolation (other tests here would load the fonts successfully first).
describe("font download failures", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("retries the download on the next render instead of failing until restart", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Google Fonts unreachable")));
    await expect(renderResumePdf({ markdown: "# Jane", applicantName: "Jane" })).rejects.toThrow(
      "Google Fonts unreachable"
    );

    vi.unstubAllGlobals();
    const pdf = await renderResumePdf({ markdown: "# Jane", applicantName: "Jane" });

    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  }, 30_000);
});
