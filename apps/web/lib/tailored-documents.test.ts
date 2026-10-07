import { describe, expect, it } from "vitest";
import { tailoredDocumentFor, tailoredDocumentUrl } from "./tailored-documents";

const updatedAt = new Date("2026-09-30T12:00:00Z");

function makeDocument(kind: "resume" | "cover_letter") {
  return {
    id: `doc-${kind}`,
    userId: "user-1",
    jobId: "job-1",
    kind,
    content: "content",
    createdAt: updatedAt,
    updatedAt,
  };
}

describe("tailoredDocumentFor", () => {
  it("picks the document for the requested kind", () => {
    const resume = makeDocument("resume");
    const coverLetter = makeDocument("cover_letter");

    expect(tailoredDocumentFor({ resume, coverLetter }, "resume")).toBe(resume);
    expect(tailoredDocumentFor({ resume, coverLetter }, "cover_letter")).toBe(coverLetter);
  });

  it("returns null while documents are loading or missing", () => {
    expect(tailoredDocumentFor(undefined, "resume")).toBeNull();
    expect(tailoredDocumentFor({ resume: null, coverLetter: null }, "cover_letter")).toBeNull();
  });
});

describe("tailoredDocumentUrl", () => {
  it("points at the PDF route with a version cache-buster", () => {
    expect(tailoredDocumentUrl("job-1", makeDocument("resume"))).toBe(
      `/api/jobs/job-1/documents/resume?v=${updatedAt.getTime()}`
    );
  });

  it("asks for an attachment when downloading", () => {
    expect(tailoredDocumentUrl("job-1", makeDocument("cover_letter"), { download: true })).toBe(
      `/api/jobs/job-1/documents/cover_letter?v=${updatedAt.getTime()}&download=1`
    );
  });
});
