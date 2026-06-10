import { describe, expect, it, vi } from "vitest";

const { mockClose, mockTools, mockGoto } = vi.hoisted(() => ({
  mockClose: vi.fn().mockResolvedValue(undefined),
  mockTools: vi.fn().mockResolvedValue({}),
  mockGoto: vi.fn(),
}));

vi.mock("../env", () => ({
  env: { GEMINI_API_KEY: "test-key" },
}));

vi.mock("../gemini", () => ({
  gemini: {},
}));

vi.mock("../mcp", () => ({
  createPlaywrightMCPClient: vi.fn().mockResolvedValue({
    tools: mockTools,
    close: mockClose,
    browserContext: {
      pages: () => [],
      newPage: vi.fn().mockResolvedValue({ goto: mockGoto }),
    },
  }),
}));

vi.mock("ai", () => ({
  generateText: vi.fn(),
  stepCountIs: vi.fn().mockReturnValue({}),
  tool: vi.fn().mockReturnValue({}),
  Output: { object: vi.fn().mockReturnValue({}) },
}));

vi.mock("./generate-cover-letter", () => ({
  generateCoverLetter: vi.fn().mockResolvedValue("Mock cover letter"),
}));

import type { Job } from "@repo/db";
import { generateText } from "ai";
import { type ProfileWithEmail, applyToJob } from "./apply-agent";

const mockJob = {
  id: "job-1",
  userId: "user-1",
  runId: "run-1",
  title: "Software Engineer",
  company: "Acme",
  location: "Remote",
  description: "A great job",
  url: "https://example.com/jobs/1",
  platform: "linkedin" as const,
  workplaceType: "on-site" as const,
  fitTier: "strong" as const,
  status: "pending_review" as const,
  externalApplyUrl: null,
  listedAt: new Date(),
  appliedAt: null,
  failureReason: null,
  createdAt: new Date(),
  updatedAt: new Date(),
} satisfies Job;

const mockProfile = {
  id: "profile-1",
  userId: "user-1",
  firstName: "Jane",
  lastName: "Doe",
  email: "jane@example.com",
  phone: "555-1234",
  address: "123 Main St",
  linkedinUrl: null,
  githubUrl: null,
  websiteUrl: null,
  resume: "Jane Doe\n5 years experience",
  coverLetterInstructions: null,
  requiresSponsorship: false,
  createdAt: new Date(),
  updatedAt: new Date(),
} satisfies ProfileWithEmail;

describe("applyToJob", () => {
  it("returns success when agent returns success", async () => {
    vi.mocked(generateText).mockResolvedValueOnce({
      output: { success: true },
      steps: [],
    } as never);

    const result = await applyToJob(mockJob, mockProfile, "/tmp/resume.pdf", 90000, undefined);

    expect(result).toEqual({ success: true });
  });

  it("returns failure when agent returns failure with reason", async () => {
    vi.mocked(generateText).mockResolvedValueOnce({
      output: { success: false, reason: "CAPTCHA detected" },
      steps: [],
    } as never);

    const result = await applyToJob(mockJob, mockProfile, "/tmp/resume.pdf", 90000, undefined);

    expect(result).toEqual({ success: false, reason: "CAPTCHA detected" });
  });

  it("returns failure with fallback reason when agent omits reason", async () => {
    vi.mocked(generateText).mockResolvedValueOnce({
      output: { success: false },
      steps: [],
    } as never);

    const result = await applyToJob(mockJob, mockProfile, "/tmp/resume.pdf", 90000, undefined);

    expect(result.success).toBe(false);
    expect((result as { success: false; reason: string }).reason).toBe(
      "Agent finished without a reason"
    );
  });

  it("navigates directly to the external apply URL when it loads", async () => {
    mockGoto.mockClear();
    mockGoto.mockResolvedValueOnce({ status: () => 200 });
    vi.mocked(generateText).mockResolvedValueOnce({
      output: { success: true },
      steps: [],
    } as never);

    const externalJob = { ...mockJob, externalApplyUrl: "https://boards.greenhouse.io/acme/1" };
    await applyToJob(externalJob, mockProfile, "/tmp/resume.pdf", 90000, undefined);

    expect(mockGoto).toHaveBeenCalledTimes(1);
    expect(mockGoto).toHaveBeenCalledWith("https://boards.greenhouse.io/acme/1", expect.anything());
  });

  it("falls back to the job URL when the external apply URL returns an error status", async () => {
    mockGoto.mockClear();
    mockGoto.mockResolvedValueOnce({ status: () => 404 });
    vi.mocked(generateText).mockResolvedValueOnce({
      output: { success: true },
      steps: [],
    } as never);

    const externalJob = { ...mockJob, externalApplyUrl: "https://boards.greenhouse.io/acme/1" };
    await applyToJob(externalJob, mockProfile, "/tmp/resume.pdf", 90000, undefined);

    expect(mockGoto).toHaveBeenCalledTimes(2);
    expect(mockGoto).toHaveBeenLastCalledWith(mockJob.url, expect.anything());
  });

  it("falls back to the job URL when navigating to the external apply URL throws", async () => {
    mockGoto.mockClear();
    mockGoto.mockRejectedValueOnce(new Error("net::ERR_NAME_NOT_RESOLVED"));
    vi.mocked(generateText).mockResolvedValueOnce({
      output: { success: true },
      steps: [],
    } as never);

    const externalJob = { ...mockJob, externalApplyUrl: "https://gone.example.com/jobs/1" };
    await applyToJob(externalJob, mockProfile, "/tmp/resume.pdf", 90000, undefined);

    expect(mockGoto).toHaveBeenCalledTimes(2);
    expect(mockGoto).toHaveBeenLastCalledWith(mockJob.url, expect.anything());
  });

  it("always closes the MCP client", async () => {
    mockClose.mockClear();
    vi.mocked(generateText).mockRejectedValueOnce(new Error("network error"));

    await expect(
      applyToJob(mockJob, mockProfile, "/tmp/resume.pdf", 90000, undefined)
    ).rejects.toThrow("network error");

    expect(mockClose).toHaveBeenCalledOnce();
  });
});
