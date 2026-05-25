import { describe, expect, it, vi } from "vitest";

const { mockClose, mockTools } = vi.hoisted(() => ({
  mockClose: vi.fn().mockResolvedValue(undefined),
  mockTools: vi.fn().mockResolvedValue({}),
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
  }),
}));

vi.mock("ai", () => ({
  generateText: vi.fn(),
  stepCountIs: vi.fn().mockReturnValue({}),
}));

import type { Job, Profile } from "@repo/db";
import { generateText } from "ai";
import { applyToJob } from "./apply-agent";

const mockJob = {
  id: "job-1",
  userId: "user-1",
  title: "Software Engineer",
  company: "Acme",
  location: "Remote",
  description: "A great job",
  url: "https://example.com/jobs/1",
  platform: "linkedin" as const,
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
  phone: "555-1234",
  address: "123 Main St",
  linkedinUrl: null,
  githubUrl: null,
  websiteUrl: null,
  resume: "Jane Doe\n5 years experience",
  coverLetterInstructions: null,
  linkedinEmail: null,
  linkedinPasswordEncrypted: null,
  createdAt: new Date(),
  updatedAt: new Date(),
} satisfies Profile;

describe("applyToJob", () => {
  it("returns success when agent responds SUCCESS", async () => {
    vi.mocked(generateText).mockResolvedValueOnce({ text: "SUCCESS" } as never);

    const result = await applyToJob(mockJob, mockProfile, "/tmp/resume.pdf");

    expect(result).toEqual({ success: true });
  });

  it("returns failure when agent responds FAILURE:<reason>", async () => {
    vi.mocked(generateText).mockResolvedValueOnce({ text: "FAILURE:CAPTCHA detected" } as never);

    const result = await applyToJob(mockJob, mockProfile, "/tmp/resume.pdf");

    expect(result).toEqual({ success: false, reason: "CAPTCHA detected" });
  });

  it("returns failure for unexpected agent response", async () => {
    vi.mocked(generateText).mockResolvedValueOnce({ text: "I navigated to the page" } as never);

    const result = await applyToJob(mockJob, mockProfile, "/tmp/resume.pdf");

    expect(result.success).toBe(false);
    expect((result as { success: false; reason: string }).reason).toContain("Unexpected");
  });

  it("always closes the MCP client", async () => {
    mockClose.mockClear();
    vi.mocked(generateText).mockRejectedValueOnce(new Error("network error"));

    await expect(applyToJob(mockJob, mockProfile, "/tmp/resume.pdf")).rejects.toThrow("network error");

    expect(mockClose).toHaveBeenCalledOnce();
  });
});
