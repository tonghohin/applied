import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("ai", () => ({
  generateText: vi.fn(),
  createGateway: vi.fn().mockReturnValue((modelId: string) => modelId),
}));

import { generateText } from "ai";
import { tailorCoverLetter } from "./tailor-cover-letter";
import { tailorResume } from "./tailor-resume";

const job = {
  title: "Backend Engineer",
  company: "Acme",
  description: "We need Kubernetes and Go experience.",
};

function lastCall() {
  const callArg = vi.mocked(generateText).mock.calls.at(-1)?.[0];
  if (!callArg) throw new Error("generateText was not called");
  return callArg;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("tailorResume", () => {
  it("sends the job description and resume with the no-fabrication rule", async () => {
    vi.mocked(generateText).mockResolvedValueOnce({ text: "# Jane" } as never);

    await tailorResume({ resume: "Jane Doe\nGo, k8s", job, apiKey: "key" });

    const callArg = lastCall();
    expect(callArg).toMatchObject({
      model: "google/gemini-2.5-flash",
      telemetry: { isEnabled: true, functionId: "tailor-resume" },
    });
    expect(callArg.prompt).toContain("We need Kubernetes and Go experience.");
    expect(callArg.prompt).toContain("Jane Doe\nGo, k8s");
    expect(callArg.instructions).toContain("Never invent or embellish facts");
  });

  it("includes contact details only when provided", async () => {
    vi.mocked(generateText).mockResolvedValue({ text: "# Jane" } as never);

    await tailorResume({ resume: "Jane", job, apiKey: "key" });
    expect(lastCall().prompt).not.toContain("Candidate contact details");

    await tailorResume({ resume: "Jane", job, contactLines: ["jane@example.com"], apiKey: "key" });
    expect(lastCall().prompt).toContain("Candidate contact details");
    expect(lastCall().prompt).toContain("jane@example.com");
  });

  it("strips code fences from the model output", async () => {
    vi.mocked(generateText).mockResolvedValueOnce({
      text: "```markdown\n# Jane Doe\n## Skills\nGo\n```",
    } as never);

    const result = await tailorResume({ resume: "Jane", job, apiKey: "key" });

    expect(result).toBe("# Jane Doe\n## Skills\nGo");
  });

  it("propagates model errors", async () => {
    vi.mocked(generateText).mockRejectedValueOnce(new Error("gateway down"));

    await expect(tailorResume({ resume: "Jane", job, apiKey: "key" })).rejects.toThrow(
      "gateway down"
    );
  });
});

describe("tailorCoverLetter", () => {
  it("sends the job and resume with the no-fabrication rule and no tools", async () => {
    vi.mocked(generateText).mockResolvedValueOnce({ text: "Dear Hiring Manager," } as never);

    await tailorCoverLetter({ resume: "Jane Doe", job, apiKey: "key" });

    const callArg = lastCall();
    expect(callArg).not.toHaveProperty("tools");
    expect(callArg).toMatchObject({
      telemetry: { isEnabled: true, functionId: "tailor-cover-letter" },
    });
    expect(callArg.prompt).toContain("Company: Acme");
    expect(callArg.prompt).toContain("Jane Doe");
    expect(callArg.instructions).toContain("Never invent or embellish facts");
    expect(callArg.instructions).toContain('Start with "Dear Hiring Manager,"');
  });

  it("includes cover letter instructions only when provided", async () => {
    vi.mocked(generateText).mockResolvedValue({ text: "Dear Hiring Manager," } as never);

    await tailorCoverLetter({ resume: "Jane", job, instructions: null, apiKey: "key" });
    expect(lastCall().prompt).not.toContain("Cover letter instructions");

    await tailorCoverLetter({
      resume: "Jane",
      job,
      instructions: "Keep it under 200 words.",
      apiKey: "key",
    });
    expect(lastCall().prompt).toContain("Keep it under 200 words.");
  });

  it("omits the description section when the job has none", async () => {
    vi.mocked(generateText).mockResolvedValueOnce({ text: "Dear Hiring Manager," } as never);

    await tailorCoverLetter({ resume: "Jane", job: { ...job, description: null }, apiKey: "key" });

    expect(lastCall().prompt).not.toContain("Job description:");
  });

  it("returns trimmed text", async () => {
    vi.mocked(generateText).mockResolvedValueOnce({ text: "  Dear Hiring Manager,\n  " } as never);

    const result = await tailorCoverLetter({ resume: "Jane", job, apiKey: "key" });

    expect(result).toBe("Dear Hiring Manager,");
  });
});
