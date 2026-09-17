import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("ai", () => ({
  Output: { object: vi.fn((config: unknown) => config) },
  generateText: vi.fn(),
  createGateway: vi.fn().mockReturnValue((modelId: string) => modelId),
}));

import { generateText } from "ai";
import { scoreJob } from "./score-job";

const mockJob = {
  title: "Software Engineer",
  company: "Acme",
  description: "Build great software.",
};

describe("scoreJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the score and reasoning from the model output unchanged", async () => {
    vi.mocked(generateText).mockResolvedValueOnce({
      output: { score: 85, reasoning: "Strong skill overlap, seniority matches." },
    } as never);

    const result = await scoreJob(mockJob, "Jane Doe\n5 years experience", "test-api-key");

    expect(result).toEqual({ score: 85, reasoning: "Strong skill overlap, seniority matches." });
  });
});
