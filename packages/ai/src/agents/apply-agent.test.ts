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

  it("pins gateway routing to vertex (AI Studio rejects tools + JSON response format)", async () => {
    vi.mocked(generateText).mockResolvedValueOnce({
      output: { success: true },
      steps: [],
    } as never);

    await applyToJob(mockJob, mockProfile, "/tmp/resume.pdf", 90000, undefined);

    const callArgs = vi.mocked(generateText).mock.calls.at(-1)?.[0];
    expect(callArgs?.providerOptions).toEqual({ gateway: { only: ["vertex"] } });
  });

  it("always pre-navigates to the job's LinkedIn URL", async () => {
    mockGoto.mockClear();
    vi.mocked(generateText).mockResolvedValueOnce({
      output: { success: true },
      steps: [],
    } as never);

    await applyToJob(mockJob, mockProfile, "/tmp/resume.pdf", 90000, undefined);

    expect(mockGoto).toHaveBeenCalledTimes(1);
    expect(mockGoto).toHaveBeenCalledWith(mockJob.url, expect.anything());
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
