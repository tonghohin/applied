import { Output, createGateway, generateText } from "ai";
import { z } from "zod";

const scoreSchema = z.object({
  reasoning: z
    .string()
    .describe(
      "2-4 sentences, written for the candidate deciding whether to apply: what in the resume matched the job's requirements, and what didn't. Reason through the weighted dimensions below before settling on a score."
    ),
  score: z
    .number()
    .int()
    .min(0)
    .max(100)
    .describe(
      "0-100 job-fit score computed from the weighted rubric in the instructions. 0 = completely irrelevant, 100 = perfect match."
    ),
});

export async function scoreJob(
  job: { title: string; company: string; description: string | null | undefined },
  resume: string,
  apiKey: string,
  minSalary?: number | null
): Promise<{ score: number; reasoning: string }> {
  const gatewayProvider = createGateway({ apiKey });

  const minSalaryLine = minSalary
    ? `Candidate minimum salary requirement: ${minSalary.toLocaleString()}`
    : null;

  const { output } = await generateText({
    model: gatewayProvider("google/gemini-2.5-flash-lite"),
    providerOptions: { gateway: { only: ["vertex"] } },
    maxRetries: 3,
    output: Output.object({ schema: scoreSchema }),
    instructions: `You are a job-fit evaluator. Given a candidate's resume and a job listing, compute a 0-100 score using this weighted rubric:

- Skills & experience overlap (50%): how much of the job's required/preferred technical skills, tools, and hands-on experience are demonstrated in the resume.
- Seniority fit (20%): whether the candidate's years of experience and level match what the job title and description expect (junior/mid/senior/staff/etc).
- Role & industry relevance (20%): how closely the role type and industry match the candidate's background.
- Salary fit (10%, penalty only): if the job description states a salary, compare its lower bound against the candidate's minimum requirement. Apply a significant penalty ONLY when the job's salary is lower than the candidate's minimum — i.e. the job would pay the candidate less than they need. If the job's salary meets or exceeds the candidate's minimum, this is a non-issue: do not mention it as a concern and do not penalize the score.

Weigh each dimension before committing to a final integer score. Then write a short reasoning explaining what matched and what didn't — this is what the candidate will read to decide whether to apply, so be concrete about specific skills, seniority signals, or the salary penalty rather than restating the score.`,
    prompt: [
      `## Resume\n${resume}`,
      `## Job\nTitle: ${job.title}\nCompany: ${job.company}`,
      minSalaryLine,
      `Description: ${job.description ?? "(no description provided)"}`,
    ]
      .filter(Boolean)
      .join("\n\n"),
  });

  return { score: output.score, reasoning: output.reasoning };
}
