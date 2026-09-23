import { Output, createGateway, generateText } from "ai";
import { format } from "date-fns";
import { z } from "zod";
import { computeScore, scoreFactsSchema } from "./score-rubric";

// `reasoning` is declared last so the model writes it after extracting the facts it refers to.
const scoreOutputSchema = scoreFactsSchema.extend({
  reasoning: z
    .string()
    .describe(
      "1-3 short sentences shown directly to the candidate, stating only how and why the job matches or doesn't match their resume: the key skills or experience that line up, and the key requirements the resume doesn't show. No filler, no praise, no restating the job description. Never mention points, weights, or how the score was calculated."
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
    output: Output.object({ schema: scoreOutputSchema }),
    instructions: `You are a job-fit evaluator. Given a candidate's resume and a job listing, extract the facts described in the output schema about how well they match. Do not output a score; it is calculated separately from your answers.

Base every judgment strictly on what is explicitly written in the job description. Do not assume typical industry norms, typical salary ranges, or unstated requirements that aren't in the text — if something isn't mentioned in the job description, treat it as unknown, not as a gap or red flag.

- Skills: list a required or preferred skill as missing only if the resume shows no evidence of it, directly or through clearly equivalent experience. Never list the same requirement twice.
- Years: take requiredYears from the job description only. Work out candidateYears from the resume dates and today's date. Do not adjust either number to be generous or harsh.
- Salary: report only a salary explicitly stated in the job description. For a range, report the upper bound as written, with the pay period it is quoted in. Do not convert or estimate.
- Sponsorship: set jobBlocksSponsorship only from explicit wording in the job description.

Then write the reasoning. It is shown directly to the candidate, so keep it concise: one to three short sentences on how and why the job does or doesn't match their resume. Name only the few most important skills, tools, or requirements that line up or are missing; do not list every requirement, restate the job description, or add praise or filler. Do not mention points, weights, percentages, the rubric, or how the score was calculated.

Mention salary only when the salary you extracted, converted to a yearly amount (hourly x 2,080, weekly x 52, monthly x 12), has an upper bound below the candidate's minimum salary requirement, and say what the shortfall is. Mention work authorization only when you set jobBlocksSponsorship to true and the candidate requires visa sponsorship. Never say salary or work authorization is met, fine, or not a concern; leave them out entirely. If there is a major mismatch such as a large years-of-experience gap, lead with it.`,
    prompt: [
      `Today's date: ${format(new Date(), "yyyy-MM-dd")}`,
      `## Resume\n${resume}`,
      `## Job\nTitle: ${job.title}\nCompany: ${job.company}`,
      minSalaryLine,
      `Candidate requires visa sponsorship: ${requiresSponsorship ? "Yes" : "No"}`,
      `Description: ${job.description ?? "(no description provided)"}`,
    ]
      .filter(Boolean)
      .join("\n\n"),
  });

  const { score } = computeScore(output, { minSalary, requiresSponsorship });

  return { score, reasoning: output.reasoning };
}
