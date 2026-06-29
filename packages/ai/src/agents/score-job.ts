import { Output, createGateway, generateText } from "ai";
import { z } from "zod";

const scoreSchema = z.object({
  score: z
    .number()
    .int()
    .min(0)
    .max(100)
    .describe(
      "How well the job matches the resume. 0 = completely irrelevant, 100 = perfect match. Consider: skill overlap, seniority fit, role relevance, and industry alignment."
    ),
});

export async function scoreJob(
  job: { title: string; company: string; description: string | null | undefined },
  resume: string,
  apiKey: string,
  minSalary?: number | null
): Promise<number> {
  const gatewayProvider = createGateway({ apiKey });

  const minSalaryLine = minSalary
    ? `Candidate minimum salary requirement: ${minSalary.toLocaleString()}`
    : null;

  const { output } = await generateText({
    model: gatewayProvider("google/gemini-2.5-flash-lite"),
    providerOptions: { gateway: { only: ["vertex"] } },
    maxRetries: 3,
    output: Output.object({ schema: scoreSchema }),
    instructions: `You are a job-fit evaluator. Given a candidate's resume and a job listing, output a score from 0 to 100 indicating how well the candidate matches the job. Focus on: technical skill overlap, seniority level, role type, and industry relevance. If the job description mentions a salary and it falls below the candidate's minimum requirement, reduce the score significantly.`,
    prompt: [
      `## Resume\n${resume}`,
      `## Job\nTitle: ${job.title}\nCompany: ${job.company}`,
      minSalaryLine,
      `Description: ${job.description ?? "(no description provided)"}`,
    ]
      .filter(Boolean)
      .join("\n\n"),
  });

  return Math.max(0, Math.min(100, output.score));
}
