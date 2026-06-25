import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("ai", () => ({
  generateText: vi.fn(),
  createGateway: vi.fn().mockReturnValue((modelId: string) => modelId),
}));

import type { Job } from "@repo/db";
import { generateText } from "ai";
import type { ProfileWithEmail } from "./apply-agent";
import { generateCoverLetter } from "./generate-cover-letter";

const mockJob = {
  id: "job-1",
  userId: "user-1",
  runId: "run-1",
  title: "Software Engineer",
  company: "Acme",
  location: "Remote",
  description: "Build great software.",
  url: "https://example.com/jobs/1",
  platform: "linkedin" as const,
  workplaceType: "remote" as const,
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
  noticePeriod: "2_weeks",
  aiGatewayKeyEncrypted: null,
  createdAt: new Date(),
  updatedAt: new Date(),
} satisfies ProfileWithEmail;

describe("generateCoverLetter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls generateText with no tools and no stopWhen", async () => {
    vi.mocked(generateText).mockResolvedValueOnce({
      text: "Dear Hiring Manager,\nI am excited.",
    } as never);

    await generateCoverLetter(mockJob, mockProfile, "test-api-key");

    const callArg = vi.mocked(generateText).mock.calls[0]?.[0];
    expect(callArg).toBeDefined();
    expect(callArg).not.toHaveProperty("tools");
    expect(callArg).not.toHaveProperty("stopWhen");
  });

  it("uses google/gemini-2.5-flash model", async () => {
    vi.mocked(generateText).mockResolvedValueOnce({ text: "Dear Hiring Manager," } as never);

    await generateCoverLetter(mockJob, mockProfile, "test-api-key");

    const callArg = vi.mocked(generateText).mock.calls[0]?.[0];
    expect(callArg).toMatchObject({ model: "google/gemini-2.5-flash-lite" });
  });

  it("enables telemetry", async () => {
    vi.mocked(generateText).mockResolvedValueOnce({ text: "Dear Hiring Manager," } as never);

    await generateCoverLetter(mockJob, mockProfile, "test-api-key");

    const callArg = vi.mocked(generateText).mock.calls[0]?.[0];
    expect(callArg).toMatchObject({ experimental_telemetry: { isEnabled: true } });
  });

  it("returns trimmed text", async () => {
    vi.mocked(generateText).mockResolvedValueOnce({ text: "  Dear Hiring Manager,\n  " } as never);

    const result = await generateCoverLetter(mockJob, mockProfile, "test-api-key");

    expect(result).toBe("Dear Hiring Manager,");
  });

  it("includes cover letter instructions in prompt when provided", async () => {
    vi.mocked(generateText).mockResolvedValueOnce({ text: "Dear Hiring Manager," } as never);
    const profileWithInstructions = {
      ...mockProfile,
      coverLetterInstructions: "Keep it under 200 words.",
    };

    await generateCoverLetter(mockJob, profileWithInstructions, "test-api-key");

    const callArg = vi.mocked(generateText).mock.calls[0]?.[0];
    expect((callArg as { prompt: string }).prompt).toContain("Keep it under 200 words.");
  });
});
