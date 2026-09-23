import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("ai", () => ({
  Output: { object: vi.fn((config: unknown) => config) },
  generateText: vi.fn(),
  createGateway: vi.fn().mockReturnValue((modelId: string) => modelId),
}));

import { generateText } from "ai";
import { scoreJob } from "./score-job";
import { BLOCKER_SCORE_CAP, type ScoreFacts } from "./score-rubric";

const mockJob = {
  title: "Software Engineer",
  company: "Acme",
  description: "Build great software.",
};

const RESUME = "Jane Doe\n5 years experience";

const CLEAN_FACTS: ScoreFacts = {
  missingRequiredSkills: [],
  missingPreferredSkills: [],
  requiredYears: null,
  candidateYears: 5,
  titleLevel: "at-or-below",
  roleMatch: "same",
  industryMatch: "same-or-transferable",
  statedSalary: null,
  jobBlocksSponsorship: false,
};

function mockModelOutput(overrides: Partial<ScoreFacts> = {}, reasoning = "Solid overlap.") {
  vi.mocked(generateText).mockResolvedValueOnce({
    output: { ...CLEAN_FACTS, ...overrides, reasoning },
  } as never);
}

function lastPrompt() {
  return vi.mocked(generateText).mock.lastCall?.[0].prompt;
}

describe("scoreJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 8, 20, 12));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("computes the score in code from the extracted facts and returns the reasoning unchanged", async () => {
    mockModelOutput({ missingRequiredSkills: ["Go", "Kafka"] }, "Missing Go and Kafka experience.");

    const result = await scoreJob(mockJob, RESUME, "test-api-key");

    expect(result).toEqual({ score: 84, reasoning: "Missing Go and Kafka experience." });
  });

  it("returns 100 when no deduction fires", async () => {
    mockModelOutput();

    const result = await scoreJob(mockJob, RESUME, "test-api-key");

    expect(result.score).toBe(100);
  });

  it("deducts for a stated salary below the candidate's minimum", async () => {
    mockModelOutput({ statedSalary: { amount: 100_000, period: "annual" } });

    const result = await scoreJob(mockJob, RESUME, "test-api-key", 130_000);

    expect(result.score).toBe(85);
  });

  it("caps the score when the job blocks sponsorship and the candidate needs it", async () => {
    mockModelOutput({ jobBlocksSponsorship: true });

    const result = await scoreJob(mockJob, RESUME, "test-api-key", null, true);

    expect(result.score).toBe(BLOCKER_SCORE_CAP);
  });

  it("ignores a job that blocks sponsorship when the candidate does not need it", async () => {
    mockModelOutput({ jobBlocksSponsorship: true });

    const result = await scoreJob(mockJob, RESUME, "test-api-key", null, false);

    expect(result.score).toBe(100);
  });

  it("sends the resume, job details, today's date and sponsorship line to the model", async () => {
    mockModelOutput();

    await scoreJob(mockJob, RESUME, "test-api-key", null, true);

    const prompt = lastPrompt();
    expect(prompt).toContain(RESUME);
    expect(prompt).toContain("Title: Software Engineer");
    expect(prompt).toContain("Company: Acme");
    expect(prompt).toContain("Description: Build great software.");
    expect(prompt).toContain("Today's date: 2026-09-20");
    expect(prompt).toContain("Candidate requires visa sponsorship: Yes");
  });

  it("includes the minimum salary line only when a minimum is set", async () => {
    mockModelOutput();
    await scoreJob(mockJob, RESUME, "test-api-key", 130_000);
    expect(lastPrompt()).toContain("Candidate minimum salary requirement:");

    mockModelOutput();
    await scoreJob(mockJob, RESUME, "test-api-key", null);
    expect(lastPrompt()).not.toContain("Candidate minimum salary requirement:");
  });
});
