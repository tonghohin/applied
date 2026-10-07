import { existsSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetJobForUser,
  mockGetProfileWithEmail,
  mockGetCriteria,
  mockGetTailoredDocumentsForJob,
  mockUpsertTailoredDocument,
  mockUpdateJobApplied,
  mockUpdateJobFailed,
  mockTailorResume,
  mockRenderResumePdf,
  mockApplyToJob,
} = vi.hoisted(() => ({
  mockGetJobForUser: vi.fn(),
  mockGetProfileWithEmail: vi.fn(),
  mockGetCriteria: vi.fn(),
  mockGetTailoredDocumentsForJob: vi.fn(),
  mockUpsertTailoredDocument: vi.fn(),
  mockUpdateJobApplied: vi.fn(),
  mockUpdateJobFailed: vi.fn(),
  mockTailorResume: vi.fn(),
  mockRenderResumePdf: vi.fn(),
  mockApplyToJob: vi.fn(),
}));

vi.mock("@repo/db", () => ({
  getJobForUser: mockGetJobForUser,
  getProfileWithEmailForUser: mockGetProfileWithEmail,
  getJobCriteriaForUser: mockGetCriteria,
  getTailoredDocumentsForJob: mockGetTailoredDocumentsForJob,
  upsertTailoredDocument: mockUpsertTailoredDocument,
  updateJobApplied: mockUpdateJobApplied,
  updateJobFailed: mockUpdateJobFailed,
}));

vi.mock("../errors", () => ({
  describeAiError: (error: Error) => error.message,
}));

vi.mock("../tailoring", () => ({
  tailorResume: mockTailorResume,
}));

vi.mock("@repo/documents", () => ({
  renderResumePdf: mockRenderResumePdf,
  renderCoverLetterPdf: vi.fn().mockResolvedValue(Buffer.from("%PDF-cover")),
  documentFileName: ({ kind, company }: { kind: string; company: string }) =>
    `Jane Doe - ${kind === "resume" ? "Resume" : "Cover Letter"} - ${company}.pdf`,
  contactLinesFor: () => ["jane@example.com"],
}));

vi.mock("./apply-agent", () => ({ applyToJob: mockApplyToJob }));

import { processApplyJob } from "./process-apply";

const db = {} as never;
const job = {
  id: "job-1",
  userId: "user-1",
  title: "Backend Engineer",
  company: "Acme",
  description: "Go and Kubernetes",
  url: "https://example.com/jobs/1",
};
const profile = { firstName: "Jane", lastName: "Doe", resume: "Base resume" };

function tailoredDocument(kind: "resume" | "cover_letter", content: string) {
  return { id: `doc-${kind}`, userId: "user-1", jobId: "job-1", kind, content };
}

function appliedDocuments() {
  const documents = mockApplyToJob.mock.calls.at(-1)?.[2];
  if (!documents) throw new Error("applyToJob was not called");
  return documents;
}

function renderedMarkdown() {
  return mockRenderResumePdf.mock.calls.at(-1)?.[0].markdown;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetJobForUser.mockResolvedValue(job);
  mockGetProfileWithEmail.mockResolvedValue(profile);
  mockGetCriteria.mockResolvedValue({ minSalary: 90000 });
  mockGetTailoredDocumentsForJob.mockResolvedValue([]);
  mockUpsertTailoredDocument.mockResolvedValue({});
  mockTailorResume.mockResolvedValue("# Freshly tailored");
  mockRenderResumePdf.mockResolvedValue(Buffer.from("%PDF-"));
  mockApplyToJob.mockResolvedValue({ success: true });
});

describe("processApplyJob", () => {
  it("uses the saved tailored resume and cover letter as-is", async () => {
    mockGetTailoredDocumentsForJob.mockResolvedValueOnce([
      tailoredDocument("resume", "# Reviewed resume"),
      tailoredDocument("cover_letter", "Reviewed letter"),
    ]);

    await processApplyJob(db, "job-1", "user-1", "api-key");

    expect(mockTailorResume).not.toHaveBeenCalled();
    expect(renderedMarkdown()).toBe("# Reviewed resume");
    expect(appliedDocuments()).toMatchObject({
      resumeText: "# Reviewed resume",
      coverLetter: "Reviewed letter",
    });
  });

  it("tailors and saves a resume before applying when none exists", async () => {
    await processApplyJob(db, "job-1", "user-1", "api-key");

    expect(mockTailorResume).toHaveBeenCalledWith({
      resume: "Base resume",
      job,
      contactLines: ["jane@example.com"],
      apiKey: "api-key",
    });
    expect(mockUpsertTailoredDocument).toHaveBeenCalledWith(db, {
      userId: "user-1",
      jobId: "job-1",
      kind: "resume",
      content: "# Freshly tailored",
    });
    expect(renderedMarkdown()).toBe("# Freshly tailored");
    expect(appliedDocuments()).toMatchObject({
      resumeText: "# Freshly tailored",
      coverLetter: undefined,
    });
  });

  it("fails without applying when tailoring the resume fails", async () => {
    mockTailorResume.mockRejectedValueOnce(new Error("gateway down"));

    await expect(processApplyJob(db, "job-1", "user-1", "api-key")).rejects.toThrow(
      "Couldn't generate a tailored resume: gateway down"
    );

    expect(mockUpsertTailoredDocument).not.toHaveBeenCalled();
    expect(mockRenderResumePdf).not.toHaveBeenCalled();
    expect(mockApplyToJob).not.toHaveBeenCalled();
  });

  it("fails without applying when the model returns an empty resume", async () => {
    mockTailorResume.mockResolvedValueOnce("");

    await expect(processApplyJob(db, "job-1", "user-1", "api-key")).rejects.toThrow(
      "the model returned nothing"
    );
    expect(mockApplyToJob).not.toHaveBeenCalled();
  });

  it("fails without applying when the tailored resume can't be saved", async () => {
    mockUpsertTailoredDocument.mockRejectedValueOnce(new Error("db down"));

    await expect(processApplyJob(db, "job-1", "user-1", "api-key")).rejects.toThrow(
      "Couldn't save the tailored resume: db down"
    );
    expect(mockApplyToJob).not.toHaveBeenCalled();
  });

  it("fails without calling the model when the job has no description", async () => {
    mockGetJobForUser.mockResolvedValueOnce({ ...job, description: null });

    await expect(processApplyJob(db, "job-1", "user-1", "api-key")).rejects.toThrow(
      "This job has no description to tailor a resume against"
    );
    expect(mockTailorResume).not.toHaveBeenCalled();
    expect(mockApplyToJob).not.toHaveBeenCalled();
  });

  it("still applies with a saved tailored resume when the job has no description", async () => {
    mockGetJobForUser.mockResolvedValueOnce({ ...job, description: null });
    mockGetTailoredDocumentsForJob.mockResolvedValueOnce([
      tailoredDocument("resume", "# Reviewed resume"),
    ]);

    await processApplyJob(db, "job-1", "user-1", "api-key");

    expect(renderedMarkdown()).toBe("# Reviewed resume");
    expect(mockApplyToJob).toHaveBeenCalled();
  });

  it("marks the job failed when the agent reports failure", async () => {
    mockApplyToJob.mockResolvedValueOnce({ success: false, reason: "CAPTCHA detected" });

    await processApplyJob(db, "job-1", "user-1", "api-key");

    expect(mockUpdateJobFailed).toHaveBeenCalledWith(db, "job-1", "CAPTCHA detected");
  });

  it("writes the cover letter PDF next to the resume and removes both afterwards", async () => {
    let coverLetterPath = "";
    let coverLetterBytes = "";
    mockApplyToJob.mockImplementationOnce(async (_job, _profile, documents) => {
      coverLetterPath = await documents.writeCoverLetterPdf("Dear Hiring Manager,");
      coverLetterBytes = readFileSync(coverLetterPath, "utf8");
      return { success: true };
    });

    await processApplyJob(db, "job-1", "user-1", "api-key");

    const { resumePdfPath } = appliedDocuments();
    expect(coverLetterPath).toMatch(/Jane Doe - Cover Letter - Acme\.pdf$/);
    expect(dirname(coverLetterPath)).toBe(dirname(resumePdfPath));
    expect(coverLetterBytes).toBe("%PDF-cover");
    expect(existsSync(dirname(resumePdfPath))).toBe(false);
  });

  it("removes the temporary resume PDF even when the agent throws", async () => {
    mockApplyToJob.mockRejectedValueOnce(new Error("browser crashed"));

    await expect(processApplyJob(db, "job-1", "user-1", "api-key")).rejects.toThrow(
      "browser crashed"
    );

    const { resumePdfPath } = appliedDocuments();
    expect(resumePdfPath).toMatch(/Jane Doe - Resume - Acme\.pdf$/);
    expect(existsSync(dirname(resumePdfPath))).toBe(false);
  });

  describe("cover letters generated by the agent", () => {
    async function generatedCoverLetterCallback(log = vi.fn()) {
      await processApplyJob(db, "job-1", "user-1", "api-key", undefined, log);
      const callback = appliedDocuments().onCoverLetterGenerated;
      if (!callback) throw new Error("onCoverLetterGenerated was not passed");
      return callback;
    }

    it("saves the letter to the job so the user can see what was sent", async () => {
      const onCoverLetterGenerated = await generatedCoverLetterCallback();
      mockUpsertTailoredDocument.mockClear();

      await onCoverLetterGenerated("Dear Hiring Manager,");

      expect(mockUpsertTailoredDocument).toHaveBeenCalledWith(db, {
        userId: "user-1",
        jobId: "job-1",
        kind: "cover_letter",
        content: "Dear Hiring Manager,",
      });
    });

    it("throws on a save failure so the agent stops before submitting the letter", async () => {
      const onCoverLetterGenerated = await generatedCoverLetterCallback();
      mockUpsertTailoredDocument.mockRejectedValueOnce(new Error("db down"));

      await expect(onCoverLetterGenerated("Dear Hiring Manager,")).rejects.toThrow(
        "Couldn't save the generated cover letter: db down"
      );
    });
  });
});
