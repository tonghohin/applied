import type { Job } from "@repo/db";
import { generateText } from "ai";
import type { ProfileWithEmail } from "./apply-agent";

export async function generateCoverLetter(job: Job, profile: ProfileWithEmail) {
  const instructionsSection = profile.coverLetterInstructions
    ? `\n\nCover letter instructions (follow these for tone, length, and emphasis):\n${profile.coverLetterInstructions}`
    : "";

  const { text } = await generateText({
    model: "google/gemini-2.5-flash-lite",
    system:
      "You are a professional cover letter writer. Write a concise, personalized cover letter " +
      "for the given job and applicant. Return only the cover letter body — no subject line, " +
      "no JSON wrapper. Start with 'Dear Hiring Manager,'.",
    prompt: `Job title: ${job.title}\nCompany: ${job.company}\n${job.description ? `\nJob description:\n${job.description}\n` : ""}\nApplicant resume:\n${profile.resume}${instructionsSection}`,
    experimental_telemetry: { isEnabled: true },
  });

  return text.trim();
}
