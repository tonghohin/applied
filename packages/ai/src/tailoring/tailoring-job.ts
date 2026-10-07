import { type LanguageModel, createGateway } from "ai";

export type TailoringJob = { title: string; company: string; description: string | null };

export const TAILORING_MODEL = "google/gemini-2.5-flash";

export function tailoringModel(apiKey: string): LanguageModel {
  return createGateway({ apiKey })(TAILORING_MODEL);
}

export function jobSection(job: TailoringJob): string {
  return [
    `Job title: ${job.title}`,
    `Company: ${job.company}`,
    job.description ? `\nJob description:\n${job.description}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export const NO_FABRICATION_RULE =
  "Never invent or embellish facts. Every employer, job title, date, degree, certification, " +
  "skill, tool, and metric you mention must appear in the candidate's resume. If the job asks " +
  "for something the resume does not show, leave it out — do not imply the candidate has it.";
