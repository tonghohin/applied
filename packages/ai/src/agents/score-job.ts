import { Output, createGateway, generateText } from "ai";
import { z } from "zod";

const scoreSchema = z.object({
  reasoning: z
    .string()
    .describe(
      "1-3 short sentences shown directly to the candidate, stating only how and why the job matches or doesn't match their resume: the key skills or experience that line up, and the key requirements the resume doesn't show. No filler, no praise, no restating the job description. Never mention points, weights, or how the score was calculated."
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
  minSalary?: number | null,
  requiresSponsorship = false
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
    instructions: `You are a job-fit evaluator. Given a candidate's resume and a job listing, compute a 0-100 score using this weighted rubric.

Base every judgment strictly on what is explicitly written in the job description. Do not assume typical industry norms, typical salary ranges, or unstated requirements that aren't in the text — if something isn't mentioned in the job description, treat it as unknown, not as a gap or red flag.

- Skills & experience overlap (40%): how much of the job's required/preferred technical skills, tools, and hands-on experience are demonstrated in the resume.
- Seniority fit (20%): whether the candidate's years of experience and level match what the job title and description expect (junior/mid/senior/staff/etc).
- Role & industry relevance (20%): how closely the role type and industry match the candidate's background.
- Salary fit (10%): award all 10 points unless the salary check below fails. Salary can only cost points when the job pays LESS than the candidate needs; a job that pays more than the candidate requires is a full-marks result, never a reason to lower the score. Check it in this order:
  1. Look for a salary or salary range explicitly stated in the job description. If none is stated, award all 10 points and do not mention salary in the reasoning. Never guess or infer a salary from typical rates for the role.
  2. If the salary is hourly, convert it to annual (hourly rate x 2,080). If a range is given, use the upper bound of the range.
  3. Compare that annual figure to the candidate's minimum requirement. If it is greater than or equal to the minimum, award all 10 points and do not mention salary as a concern. This includes ranges that start below the minimum but reach it or go past it (e.g. minimum 130,000 and a stated range of 114,800-191,800: the top, 191,800, is above 130,000, so full points; the lower end is irrelevant). Only if the upper bound itself is lower than the minimum, award 0 of the 10 points and note the shortfall in the reasoning.
- Work authorization (10%): award all 10 points unless BOTH are true: the candidate requires visa sponsorship (see the candidate details), and the job description explicitly says it does not offer sponsorship or requires existing work authorization, citizenship, or a security clearance the candidate can't be assumed to have. If the job description doesn't address it, or the candidate doesn't require sponsorship, award all 10 points and say nothing about it. When both are true, award 0 of the 10 points and note it in the reasoning.

Weigh each dimension before committing to a final integer score. Then write the reasoning. It is shown directly to the candidate, so keep it concise: one to three short sentences on how and why the job does or doesn't match their resume. Name only the few most important skills, tools, or requirements that line up or are missing; do not list every requirement, restate the job description, or add praise or filler. Do not mention points, weights, percentages, the rubric, or how the score was calculated. Mention salary only when the job description states a salary whose upper bound is below the candidate's minimum; otherwise say nothing about salary.`,
    prompt: [
      `## Resume\n${resume}`,
      `## Job\nTitle: ${job.title}\nCompany: ${job.company}`,
      minSalaryLine,
      `Candidate requires visa sponsorship: ${requiresSponsorship ? "Yes" : "No"}`,
      `Description: ${job.description ?? "(no description provided)"}`,
    ]
      .filter(Boolean)
      .join("\n\n"),
  });

  return { score: output.score, reasoning: output.reasoning };
}
