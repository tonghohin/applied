import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetJobForUser,
  mockGetProfileWithEmail,
  mockGetTailoredDocument,
  mockGetTailoredDocumentsForJob,
  mockUpsertTailoredDocument,
  mockDeleteTailoredDocument,
  mockGetAiGatewayKey,
  mockTailorResume,
  mockTailorCoverLetter,
  mockRenderResumePdf,
  mockRenderCoverLetterPdf,
} = vi.hoisted(() => ({
  mockGetJobForUser: vi.fn(),
  mockGetProfileWithEmail: vi.fn(),
  mockGetTailoredDocument: vi.fn(),
  mockGetTailoredDocumentsForJob: vi.fn(),
  mockUpsertTailoredDocument: vi.fn(),
  mockDeleteTailoredDocument: vi.fn(),
  mockGetAiGatewayKey: vi.fn(),
  mockTailorResume: vi.fn(),
  mockTailorCoverLetter: vi.fn(),
  mockRenderResumePdf: vi.fn(),
  mockRenderCoverLetterPdf: vi.fn(),
}));

vi.mock("@repo/db", () => ({
  getJobForUser: mockGetJobForUser,
  getProfileWithEmailForUser: mockGetProfileWithEmail,
  getTailoredDocument: mockGetTailoredDocument,
  getTailoredDocumentsForJob: mockGetTailoredDocumentsForJob,
  upsertTailoredDocument: mockUpsertTailoredDocument,
  deleteTailoredDocument: mockDeleteTailoredDocument,
}));

vi.mock("@repo/documents", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@repo/documents")>();
  return {
    contactLinesFor: actual.contactLinesFor,
    renderResumePdf: mockRenderResumePdf,
    renderCoverLetterPdf: mockRenderCoverLetterPdf,
    documentFileName: actual.documentFileName,
  };
});

vi.mock("@repo/ai/tailoring", () => ({
  tailorResume: mockTailorResume,
  tailorCoverLetter: mockTailorCoverLetter,
}));

vi.mock("./profile.service", () => ({ getAiGatewayKey: mockGetAiGatewayKey }));

import {
  deleteTailoredDocument,
  generateTailoredDocuments,
  getTailoredDocuments,
  renderTailoredDocumentPdf,
  saveTailoredDocument,
} from "./tailored-documents.service";

const db = {} as never;
const USER_ID = "user-1";
const JOB_ID = "11111111-1111-4111-8111-111111111111";

const job = {
  id: JOB_ID,
  userId: USER_ID,
  title: "Backend Engineer",
  company: "Acme",
  description: "Go and Kubernetes",
};

const profile = {
  firstName: "Jane",
  lastName: "Doe",
  email: "jane@example.com",
  phone: "555-0100",
  address: "Toronto",
  linkedinUrl: null,
  githubUrl: "https://github.com/jane",
  websiteUrl: null,
  resume: "Base resume",
  coverLetterInstructions: "Keep it short",
};

function documentRow(kind: "resume" | "cover_letter", content: string) {
  return {
    id: `doc-${kind}`,
    userId: USER_ID,
    jobId: JOB_ID,
    kind,
    content,
    updatedAt: new Date(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetJobForUser.mockResolvedValue(job);
  mockGetProfileWithEmail.mockResolvedValue(profile);
  mockGetAiGatewayKey.mockResolvedValue("api-key");
  mockGetTailoredDocumentsForJob.mockResolvedValue([]);
  mockGetTailoredDocument.mockResolvedValue(undefined);
  mockUpsertTailoredDocument.mockImplementation((_db, values) => Promise.resolve(values));
  mockTailorResume.mockResolvedValue("# Tailored resume");
  mockTailorCoverLetter.mockResolvedValue("Dear Hiring Manager,");
});

describe("getTailoredDocuments", () => {
  it("returns each kind or null", async () => {
    const resume = documentRow("resume", "# Resume");
    mockGetTailoredDocumentsForJob.mockResolvedValueOnce([resume]);

    const result = await getTailoredDocuments(db, USER_ID, JOB_ID);

    expect(mockGetTailoredDocumentsForJob).toHaveBeenCalledWith(db, JOB_ID, USER_ID);
    expect(result).toEqual({ resume, coverLetter: null });
  });
});

describe("generateTailoredDocuments", () => {
  const both = { jobId: JOB_ID, kinds: ["resume" as const, "cover_letter" as const] };

  it("throws NOT_FOUND for a job the user does not own", async () => {
    mockGetJobForUser.mockResolvedValueOnce(undefined);

    await expect(generateTailoredDocuments(db, USER_ID, both)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(mockTailorResume).not.toHaveBeenCalled();
  });

  it("throws PRECONDITION_FAILED when the job has no description", async () => {
    mockGetJobForUser.mockResolvedValueOnce({ ...job, description: null });

    await expect(generateTailoredDocuments(db, USER_ID, both)).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: "This job has no description to tailor against",
    });
  });

  it("throws PRECONDITION_FAILED when the user has no resume", async () => {
    mockGetProfileWithEmail.mockResolvedValueOnce({ ...profile, resume: "" });

    await expect(generateTailoredDocuments(db, USER_ID, both)).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: "Add your resume in Settings first",
    });
  });

  it("throws PRECONDITION_FAILED when the user has no AI key", async () => {
    mockGetAiGatewayKey.mockResolvedValueOnce(null);

    await expect(generateTailoredDocuments(db, USER_ID, both)).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: "Add your AI Gateway key in Settings → AI",
    });
  });

  it("tailors the resume first and writes the cover letter from it", async () => {
    await generateTailoredDocuments(db, USER_ID, both);

    expect(mockTailorResume).toHaveBeenCalledWith({
      resume: "Base resume",
      job,
      contactLines: ["jane@example.com", "555-0100", "Toronto", "https://github.com/jane"],
      apiKey: "api-key",
    });
    expect(mockTailorCoverLetter).toHaveBeenCalledWith({
      resume: "# Tailored resume",
      job,
      instructions: "Keep it short",
      apiKey: "api-key",
    });
    expect(mockUpsertTailoredDocument).toHaveBeenCalledWith(db, {
      userId: USER_ID,
      jobId: JOB_ID,
      kind: "resume",
      content: "# Tailored resume",
    });
    expect(mockUpsertTailoredDocument).toHaveBeenCalledWith(db, {
      userId: USER_ID,
      jobId: JOB_ID,
      kind: "cover_letter",
      content: "Dear Hiring Manager,",
    });
  });

  it("writes a cover letter alone from the saved tailored resume when one exists", async () => {
    mockGetTailoredDocument.mockResolvedValueOnce(documentRow("resume", "# Saved tailored"));

    await generateTailoredDocuments(db, USER_ID, { jobId: JOB_ID, kinds: ["cover_letter"] });

    expect(mockTailorResume).not.toHaveBeenCalled();
    expect(mockTailorCoverLetter).toHaveBeenCalledWith(
      expect.objectContaining({ resume: "# Saved tailored" })
    );
    expect(mockUpsertTailoredDocument).toHaveBeenCalledOnce();
  });

  it("falls back to the base resume for a cover letter when nothing is tailored yet", async () => {
    await generateTailoredDocuments(db, USER_ID, { jobId: JOB_ID, kinds: ["cover_letter"] });

    expect(mockTailorCoverLetter).toHaveBeenCalledWith(
      expect.objectContaining({ resume: "Base resume" })
    );
  });

  it("saves nothing when the model fails", async () => {
    mockTailorCoverLetter.mockRejectedValueOnce(new Error("gateway down"));

    await expect(generateTailoredDocuments(db, USER_ID, both)).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to generate cover letter: gateway down",
    });
    expect(mockUpsertTailoredDocument).not.toHaveBeenCalled();
  });

  it("reports a rejected AI key as a precondition with a Settings hint", async () => {
    const keyError = new Error("Unauthenticated request to AI Gateway. Set AI_GATEWAY_API_KEY");
    keyError.name = "GatewayAuthenticationError";
    mockTailorResume.mockRejectedValueOnce(keyError);

    await expect(generateTailoredDocuments(db, USER_ID, both)).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message:
        "Failed to generate resume: Your AI Gateway key was rejected. Check it in Settings → AI.",
    });
    expect(mockUpsertTailoredDocument).not.toHaveBeenCalled();
  });

  it("treats an empty model answer as a failure", async () => {
    mockTailorResume.mockResolvedValueOnce("");

    await expect(
      generateTailoredDocuments(db, USER_ID, { jobId: JOB_ID, kinds: ["resume"] })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    expect(mockUpsertTailoredDocument).not.toHaveBeenCalled();
  });
});

describe("saveTailoredDocument", () => {
  const input = { jobId: JOB_ID, kind: "resume" as const, content: "# Edited" };

  it("upserts the edited content for an owned job", async () => {
    const result = await saveTailoredDocument(db, USER_ID, input);

    expect(mockUpsertTailoredDocument).toHaveBeenCalledWith(db, { userId: USER_ID, ...input });
    expect(result).toMatchObject({ content: "# Edited" });
  });

  it("throws NOT_FOUND and saves nothing for a job the user does not own", async () => {
    mockGetJobForUser.mockResolvedValueOnce(undefined);

    await expect(saveTailoredDocument(db, USER_ID, input)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(mockUpsertTailoredDocument).not.toHaveBeenCalled();
  });
});

describe("renderTailoredDocumentPdf", () => {
  it("returns null when the job does not belong to the user", async () => {
    mockGetTailoredDocument.mockResolvedValueOnce(documentRow("resume", "# Resume"));
    mockGetJobForUser.mockResolvedValueOnce(undefined);

    const result = await renderTailoredDocumentPdf(db, USER_ID, JOB_ID, "resume");

    expect(result).toBeNull();
    expect(mockRenderResumePdf).not.toHaveBeenCalled();
  });

  it("returns null when the document does not exist", async () => {
    const result = await renderTailoredDocumentPdf(db, USER_ID, JOB_ID, "resume");

    expect(result).toBeNull();
    expect(mockRenderResumePdf).not.toHaveBeenCalled();
  });

  it("renders the resume with the applicant name", async () => {
    mockGetTailoredDocument.mockResolvedValueOnce(documentRow("resume", "# Resume"));
    mockRenderResumePdf.mockResolvedValueOnce(Buffer.from("%PDF-"));

    const result = await renderTailoredDocumentPdf(db, USER_ID, JOB_ID, "resume");

    expect(mockGetTailoredDocument).toHaveBeenCalledWith(db, JOB_ID, USER_ID, "resume");
    expect(mockRenderResumePdf).toHaveBeenCalledWith({
      markdown: "# Resume",
      applicantName: "Jane Doe",
    });
    expect(result?.fileName).toBe("Jane Doe - Resume - Acme.pdf");
  });

  it("renders the cover letter body with the document's date and no contact header", async () => {
    const letter = documentRow("cover_letter", "Dear Hiring Manager,");
    mockGetTailoredDocument.mockResolvedValueOnce(letter);
    mockRenderCoverLetterPdf.mockResolvedValueOnce(Buffer.from("%PDF-"));

    await renderTailoredDocumentPdf(db, USER_ID, JOB_ID, "cover_letter");

    expect(mockRenderCoverLetterPdf).toHaveBeenCalledWith({
      body: "Dear Hiring Manager,",
      applicantName: "Jane Doe",
      date: letter.updatedAt,
    });
  });
});

describe("deleteTailoredDocument", () => {
  it("deletes the document and returns what remains", async () => {
    const resume = documentRow("resume", "# Resume");
    mockGetTailoredDocumentsForJob.mockResolvedValueOnce([resume]);

    const result = await deleteTailoredDocument(db, USER_ID, {
      jobId: JOB_ID,
      kind: "cover_letter",
    });

    expect(mockDeleteTailoredDocument).toHaveBeenCalledWith(db, JOB_ID, USER_ID, "cover_letter");
    expect(result).toEqual({ resume, coverLetter: null });
  });

  it("throws NOT_FOUND and deletes nothing for a job the user does not own", async () => {
    mockGetJobForUser.mockResolvedValueOnce(undefined);

    await expect(
      deleteTailoredDocument(db, USER_ID, { jobId: JOB_ID, kind: "resume" })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mockDeleteTailoredDocument).not.toHaveBeenCalled();
  });
});
