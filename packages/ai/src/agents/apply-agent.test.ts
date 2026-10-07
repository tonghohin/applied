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
  isStepCount: vi.fn().mockReturnValue({}),
  isLoopFinished: vi.fn().mockReturnValue({}),
  // Return the definition unchanged so tests can call a tool's execute()
  tool: vi.fn((definition: unknown) => definition),
  Output: { object: vi.fn().mockReturnValue({}) },
  createGateway: vi.fn().mockReturnValue((modelId: string) => modelId),
}));

vi.mock("../tailoring", () => ({
  tailorCoverLetter: vi.fn().mockResolvedValue("Generated cover letter"),
}));

import type { Job } from "@repo/db";
import { generateText } from "ai";
import { tailorCoverLetter } from "../tailoring";
import { type ApplyDocuments, type ProfileWithEmail, applyToJob } from "./apply-agent";

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
  score: 80,
  scoreReasoning: "Strong skill overlap, seniority matches.",
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
  postalCode: null,
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

const mockWriteCoverLetterPdf = vi.fn().mockResolvedValue("/tmp/cover-letter.pdf");

const mockDocuments = {
  resumePdfPath: "/tmp/resume.pdf",
  resumeText: "Jane Doe\n5 years experience",
  writeCoverLetterPdf: mockWriteCoverLetterPdf,
} satisfies ApplyDocuments;

describe("applyToJob", () => {
  it("returns success when agent returns success", async () => {
    vi.mocked(generateText).mockResolvedValueOnce({
      output: { success: true },
      steps: [],
    } as never);

    const result = await applyToJob(mockJob, mockProfile, mockDocuments, 90000, undefined);

    expect(result).toEqual({ success: true });
  });

  it("returns failure when agent returns failure with reason", async () => {
    vi.mocked(generateText).mockResolvedValueOnce({
      output: { success: false, reason: "CAPTCHA detected" },
      steps: [],
    } as never);

    const result = await applyToJob(mockJob, mockProfile, mockDocuments, 90000, undefined);

    expect(result).toEqual({ success: false, reason: "CAPTCHA detected" });
  });

  it("returns failure with fallback reason when agent omits reason", async () => {
    vi.mocked(generateText).mockResolvedValueOnce({
      output: { success: false },
      steps: [],
    } as never);

    const result = await applyToJob(mockJob, mockProfile, mockDocuments, 90000, undefined);

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

    await applyToJob(mockJob, mockProfile, mockDocuments, 90000, undefined);

    const callArgs = vi.mocked(generateText).mock.calls.at(-1)?.[0];
    expect(callArgs?.providerOptions).toEqual({ gateway: { only: ["vertex"] } });
  });

  it("always pre-navigates to the job's LinkedIn URL", async () => {
    mockGoto.mockClear();
    vi.mocked(generateText).mockResolvedValueOnce({
      output: { success: true },
      steps: [],
    } as never);

    await applyToJob(mockJob, mockProfile, mockDocuments, 90000, undefined);

    expect(mockGoto).toHaveBeenCalledTimes(1);
    expect(mockGoto).toHaveBeenCalledWith(mockJob.url, expect.anything());
  });

  it("always closes the MCP client", async () => {
    mockClose.mockClear();
    vi.mocked(generateText).mockRejectedValueOnce(new Error("network error"));

    await expect(applyToJob(mockJob, mockProfile, mockDocuments, 90000, undefined)).rejects.toThrow(
      "network error"
    );

    expect(mockClose).toHaveBeenCalledOnce();
  });

  it("sends the tailored resume text but never the PDF path in the prompt", async () => {
    vi.mocked(generateText).mockResolvedValueOnce({
      output: { success: true },
      steps: [],
    } as never);

    await applyToJob(
      mockJob,
      mockProfile,
      { ...mockDocuments, resumePdfPath: "/tmp/tailored.pdf", resumeText: "# Tailored for Acme" },
      90000,
      undefined
    );

    const prompt = vi.mocked(generateText).mock.calls.at(-1)?.[0].prompt;
    expect(prompt).toContain("--- RESUME ---\n# Tailored for Acme");
    expect(prompt).not.toContain(mockProfile.resume);
    expect(prompt).not.toContain("/tmp/tailored.pdf");
  });

  describe("resume upload tools", () => {
    const mockFileUpload = vi.fn().mockResolvedValue("file chooser handled");

    async function agentTools() {
      mockFileUpload.mockClear();
      mockTools.mockResolvedValueOnce({
        browser_click: { execute: vi.fn() },
        browser_file_upload: { execute: mockFileUpload },
      });
      vi.mocked(generateText).mockResolvedValueOnce({
        output: { success: true },
        steps: [],
      } as never);
      await applyToJob(mockJob, mockProfile, mockDocuments, 90000, undefined);
      const tools = vi.mocked(generateText).mock.calls.at(-1)?.[0].tools;
      if (!tools) throw new Error("generateText was called without tools");
      return tools;
    }

    const executionOptions = { toolCallId: "call-1", messages: [], context: {} };

    it("does not expose the raw file upload tool to the model", async () => {
      const tools = await agentTools();

      expect(tools).not.toHaveProperty("browser_file_upload");
      expect(tools).toHaveProperty("browser_click");
      expect(tools).toHaveProperty("upload_resume");
      expect(tools).toHaveProperty("cancel_file_upload");
    });

    it("upload_resume attaches the resume PDF without the model supplying a path", async () => {
      const tools = await agentTools();

      const result = await tools.upload_resume?.execute?.({} as never, executionOptions);

      expect(result).toBe("file chooser handled");
      expect(mockFileUpload).toHaveBeenCalledWith({ paths: ["/tmp/resume.pdf"] }, executionOptions);
    });

    it("cancel_file_upload closes the chooser without attaching anything", async () => {
      const tools = await agentTools();

      await tools.cancel_file_upload?.execute?.({} as never, executionOptions);

      expect(mockFileUpload).toHaveBeenCalledWith({}, executionOptions);
    });
  });

  describe("generate_cover_letter tool", () => {
    async function coverLetterTool(documents: ApplyDocuments) {
      vi.mocked(generateText).mockResolvedValueOnce({
        output: { success: true },
        steps: [],
      } as never);
      await applyToJob(mockJob, mockProfile, documents, 90000, undefined, undefined, "api-key");
      const tools = vi.mocked(generateText).mock.calls.at(-1)?.[0].tools;
      const execute = tools?.generate_cover_letter?.execute;
      if (!execute) throw new Error("generate_cover_letter tool missing");
      return (required = true) =>
        execute({ required }, { toolCallId: "call-1", messages: [], context: {} });
    }

    it("returns the user's saved cover letter without calling the model", async () => {
      vi.mocked(tailorCoverLetter).mockClear();
      const onCoverLetterGenerated = vi.fn();

      const runTool = await coverLetterTool({
        ...mockDocuments,
        coverLetter: "Reviewed cover letter",
        onCoverLetterGenerated,
      });

      expect(await runTool()).toBe("Reviewed cover letter");
      expect(tailorCoverLetter).not.toHaveBeenCalled();
      expect(onCoverLetterGenerated).not.toHaveBeenCalled();
    });

    it("generates a cover letter from the resume being submitted when none is saved", async () => {
      vi.mocked(tailorCoverLetter).mockClear();

      const runTool = await coverLetterTool({
        ...mockDocuments,
        resumeText: "# Tailored for Acme",
      });

      expect(await runTool()).toBe("Generated cover letter");
      expect(tailorCoverLetter).toHaveBeenCalledWith({
        resume: "# Tailored for Acme",
        job: mockJob,
        instructions: null,
        apiKey: "api-key",
      });
    });

    // Mimics the AI SDK: run the cover letter tool, then reject if the run was aborted
    function generateTextThatCallsCoverLetterTool(required = true) {
      const toolResults: unknown[] = [];
      vi.mocked(generateText).mockImplementationOnce(async (args) => {
        const execute = args.tools?.generate_cover_letter?.execute;
        await execute?.({ required }, { toolCallId: "call-1", messages: [], context: {} })
          .then((result: unknown) => toolResults.push(result))
          .catch(() => {});
        if (args.abortSignal?.aborted) throw new Error("This operation was aborted");
        return { output: { success: true }, steps: [] } as never;
      });
      return toolResults;
    }

    it("stops the application when the cover letter can't be generated", async () => {
      vi.mocked(tailorCoverLetter).mockRejectedValueOnce(new Error("gateway down"));
      generateTextThatCallsCoverLetterTool();

      const result = await applyToJob(mockJob, mockProfile, mockDocuments, 90000, undefined);

      expect(result).toEqual({
        success: false,
        reason: "Couldn't generate a cover letter: gateway down",
      });
    });

    it("stops the application when the generated cover letter can't be saved", async () => {
      vi.mocked(tailorCoverLetter).mockResolvedValueOnce("Dear Hiring Manager,");
      generateTextThatCallsCoverLetterTool();

      const result = await applyToJob(
        mockJob,
        mockProfile,
        {
          ...mockDocuments,
          onCoverLetterGenerated: vi
            .fn()
            .mockRejectedValue(new Error("Couldn't save the generated cover letter: db down")),
        },
        90000,
        undefined
      );

      expect(result).toEqual({
        success: false,
        reason: "Couldn't save the generated cover letter: db down",
      });
    });

    it("leaves an optional cover letter empty instead of stopping when generation fails", async () => {
      vi.mocked(tailorCoverLetter).mockRejectedValueOnce(new Error("gateway down"));
      const toolResults = generateTextThatCallsCoverLetterTool(false);
      const log = vi.fn();

      const result = await applyToJob(mockJob, mockProfile, mockDocuments, 90000, undefined, log);

      expect(result).toEqual({ success: true });
      expect(toolResults[0]).toMatch(/leave it empty/);
      expect(log).toHaveBeenCalledWith(
        "Couldn't generate a cover letter: gateway down — leaving the optional cover letter field empty"
      );
    });

    it("leaves an optional cover letter empty when it can't be saved", async () => {
      vi.mocked(tailorCoverLetter).mockResolvedValueOnce("Dear Hiring Manager,");
      const toolResults = generateTextThatCallsCoverLetterTool(false);

      const result = await applyToJob(
        mockJob,
        mockProfile,
        {
          ...mockDocuments,
          onCoverLetterGenerated: vi.fn().mockRejectedValue(new Error("db down")),
        },
        90000,
        undefined
      );

      expect(result).toEqual({ success: true });
      expect(toolResults[0]).toMatch(/leave it empty/);
      expect(toolResults[0]).not.toBe("Dear Hiring Manager,");
    });

    it("does not retry an optional cover letter that already failed", async () => {
      vi.mocked(tailorCoverLetter).mockClear();
      vi.mocked(tailorCoverLetter).mockRejectedValueOnce(new Error("gateway down"));
      const runTool = await coverLetterTool(mockDocuments);

      expect(await runTool(false)).toMatch(/leave it empty/);
      expect(await runTool(false)).toMatch(/leave it empty/);
      expect(tailorCoverLetter).toHaveBeenCalledOnce();
    });

    it("gives cover letter generation a longer timeout than browser tools", async () => {
      vi.mocked(generateText).mockResolvedValueOnce({
        output: { success: true },
        steps: [],
      } as never);

      await applyToJob(mockJob, mockProfile, mockDocuments, 90000, undefined);

      expect(vi.mocked(generateText).mock.calls.at(-1)?.[0].timeout).toMatchObject({
        toolMs: 30_000,
        tools: { generate_cover_letterMs: 120_000 },
      });
    });

    it("reports a generated letter once and reuses it on later calls", async () => {
      vi.mocked(tailorCoverLetter).mockClear();
      const onCoverLetterGenerated = vi.fn().mockResolvedValue(undefined);

      const runTool = await coverLetterTool({ ...mockDocuments, onCoverLetterGenerated });

      expect(await runTool()).toBe("Generated cover letter");
      expect(await runTool()).toBe("Generated cover letter");
      expect(tailorCoverLetter).toHaveBeenCalledOnce();
      expect(onCoverLetterGenerated).toHaveBeenCalledOnce();
      expect(onCoverLetterGenerated).toHaveBeenCalledWith("Generated cover letter");
    });
  });

  describe("upload_cover_letter tool", () => {
    const mockFileUpload = vi.fn().mockResolvedValue("file chooser handled");
    const executionOptions = { toolCallId: "call-1", messages: [], context: {} };

    async function uploadCoverLetterTool(documents: ApplyDocuments) {
      mockFileUpload.mockClear();
      mockWriteCoverLetterPdf.mockClear();
      mockTools.mockResolvedValueOnce({ browser_file_upload: { execute: mockFileUpload } });
      vi.mocked(generateText).mockResolvedValueOnce({
        output: { success: true },
        steps: [],
      } as never);
      await applyToJob(mockJob, mockProfile, documents, 90000, undefined, undefined, "api-key");
      const execute = vi.mocked(generateText).mock.calls.at(-1)?.[0].tools
        ?.upload_cover_letter?.execute;
      if (!execute) throw new Error("upload_cover_letter tool missing");
      return (required: boolean) => execute({ required }, executionOptions);
    }

    it("uploads the saved cover letter as a PDF and reuses it on later calls", async () => {
      vi.mocked(tailorCoverLetter).mockClear();
      const runTool = await uploadCoverLetterTool({
        ...mockDocuments,
        coverLetter: "Reviewed cover letter",
      });

      expect(await runTool(false)).toBe("file chooser handled");
      await runTool(false);

      expect(tailorCoverLetter).not.toHaveBeenCalled();
      expect(mockWriteCoverLetterPdf).toHaveBeenCalledOnce();
      expect(mockWriteCoverLetterPdf).toHaveBeenCalledWith("Reviewed cover letter");
      expect(mockFileUpload).toHaveBeenCalledWith(
        { paths: ["/tmp/cover-letter.pdf"] },
        executionOptions
      );
    });

    it("generates, saves and uploads a letter when none is saved", async () => {
      const onCoverLetterGenerated = vi.fn().mockResolvedValue(undefined);
      const runTool = await uploadCoverLetterTool({ ...mockDocuments, onCoverLetterGenerated });

      await runTool(true);

      expect(onCoverLetterGenerated).toHaveBeenCalledWith("Generated cover letter");
      expect(mockWriteCoverLetterPdf).toHaveBeenCalledWith("Generated cover letter");
      expect(mockFileUpload).toHaveBeenCalledWith(
        { paths: ["/tmp/cover-letter.pdf"] },
        executionOptions
      );
    });

    it("closes the chooser and skips an optional upload when generation fails", async () => {
      vi.mocked(tailorCoverLetter).mockRejectedValueOnce(new Error("gateway down"));
      const runTool = await uploadCoverLetterTool(mockDocuments);

      expect(await runTool(false)).toMatch(/leave it empty/);
      expect(mockWriteCoverLetterPdf).not.toHaveBeenCalled();
      expect(mockFileUpload).toHaveBeenCalledWith({}, executionOptions);
    });

    it("closes the chooser and skips an optional upload when the PDF can't be created", async () => {
      const runTool = await uploadCoverLetterTool({
        ...mockDocuments,
        coverLetter: "Reviewed cover letter",
      });
      mockWriteCoverLetterPdf.mockRejectedValueOnce(new Error("disk full"));
      expect(await runTool(false)).toMatch(/leave it empty/);
      expect(mockFileUpload).toHaveBeenCalledWith({}, executionOptions);
    });

    it("stops the application when a required upload's PDF can't be created", async () => {
      const runTool = await uploadCoverLetterTool({
        ...mockDocuments,
        coverLetter: "Reviewed cover letter",
      });
      mockWriteCoverLetterPdf.mockRejectedValueOnce(new Error("disk full"));

      await expect(runTool(true)).rejects.toThrow("disk full");
      expect(mockFileUpload).not.toHaveBeenCalled();
    });
  });

  describe("saved cover letter note", () => {
    async function promptFor(documents: ApplyDocuments) {
      vi.mocked(generateText).mockResolvedValueOnce({
        output: { success: true },
        steps: [],
      } as never);
      await applyToJob(mockJob, mockProfile, documents, 90000, undefined);
      return vi.mocked(generateText).mock.calls.at(-1)?.[0].prompt;
    }

    it("tells the agent to use a saved cover letter even without a cover letter field", async () => {
      const prompt = await promptFor({ ...mockDocuments, coverLetter: "Reviewed cover letter" });

      expect(prompt).toContain("--- SAVED COVER LETTER ---");
      expect(prompt).toContain("Additional information");
      expect(prompt).toContain("upload_cover_letter");
    });

    it("says nothing about a saved letter when there isn't one", async () => {
      expect(await promptFor(mockDocuments)).not.toContain("SAVED COVER LETTER");
    });
  });

  it("gives typing enough time for a full cover letter", async () => {
    vi.mocked(generateText).mockResolvedValueOnce({
      output: { success: true },
      steps: [],
    } as never);

    await applyToJob(mockJob, mockProfile, mockDocuments, 90000, undefined);

    expect(vi.mocked(generateText).mock.calls.at(-1)?.[0].timeout).toMatchObject({
      toolMs: 30_000,
      tools: {
        generate_cover_letterMs: 120_000,
        upload_cover_letterMs: 150_000,
        browser_press_sequentiallyMs: 200_000,
      },
    });
  });
});
