import type { Job, Profile } from "@repo/db";
import { generateText, stepCountIs } from "ai";
import { createPlaywrightMCPClient } from "../mcp";

export type ApplyResult =
  | { success: true }
  | { success: false; reason: string };

const SYSTEM_PROMPT = `You are an automated job application agent. Your job is to navigate to a job application page and fill out the form using the applicant's profile information.

You will be given:
- A job URL to navigate to
- The applicant's profile (name, contact info, resume, cover letter)

## General instructions
1. Navigate to the job URL using browser_navigate
2. Take a snapshot with browser_snapshot to understand the page
3. Fill out all required fields using the profile information
4. Submit the application
5. When done, respond with exactly: SUCCESS
6. If you cannot complete the application for any reason, respond with exactly: FAILURE:<brief reason>

## LinkedIn Easy Apply
If the page is a LinkedIn job listing:
- Look for an "Easy Apply" button. If present, click it to open the Easy Apply modal.
- The modal is a multi-step wizard. Use browser_snapshot after each action to see the current step.
- Fill each required field on the current step before clicking "Next" or "Review".
- On the final review step, click "Submit application".
- If only an "Apply" button (not "Easy Apply") is present, it links to an external site — click it and continue applying on the external page.
- If a CAPTCHA or verification challenge appears, respond with FAILURE:CAPTCHA detected.

## Form filling rules
- Use the resume content to answer questions about experience, skills, and education.
- When a cover letter field is required, write a personalized cover letter for the specific company and position based on the applicant's resume. If COVER LETTER INSTRUCTIONS are provided, follow them (tone, length, emphasis, etc.).
- For yes/no questions about work authorisation or sponsorship, answer based on the profile if stated; otherwise assume "Yes" to work authorisation and "No" to sponsorship.
- If a required field cannot be answered from the profile, use a reasonable placeholder and note it.
- If a file upload field for a resume appears and a Resume PDF path is provided in the prompt, use browser_file_chooser to upload that file. For any other file upload fields, skip them.

Only respond with SUCCESS or FAILURE:<reason> after attempting the application — nothing else.`;

export async function applyToJob(
  job: Job,
  profile: Profile,
  resumePdfPath: string,
): Promise<ApplyResult> {
  const client = await createPlaywrightMCPClient();

  try {
    const tools = await client.tools();

    const profileSummary = [
      `Name: ${profile.firstName} ${profile.lastName}`,
      `Phone: ${profile.phone}`,
      `Address: ${profile.address}`,
      profile.linkedinUrl ? `LinkedIn: ${profile.linkedinUrl}` : null,
      profile.githubUrl ? `GitHub: ${profile.githubUrl}` : null,
      profile.websiteUrl ? `Website: ${profile.websiteUrl}` : null,
      `\n--- RESUME ---\n${profile.resume}`,
      profile.coverLetterInstructions
        ? `\n--- COVER LETTER INSTRUCTIONS ---\n${profile.coverLetterInstructions}`
        : null,
    ]
      .filter(Boolean)
      .join("\n");

    const { text } = await generateText({
      model: "google/gemini-2.5-flash",
      tools,
      stopWhen: stepCountIs(30),
      system: SYSTEM_PROMPT,
      prompt: `Apply to this job:\nURL: ${job.url}\nTitle: ${job.title} at ${job.company}\n\nApplicant profile:\n${profileSummary}${resumePdfPath ? `\n\nResume PDF path: ${resumePdfPath}` : ""}`,
    });

    const result = text.trim();
    if (result === "SUCCESS") return { success: true };
    if (result.startsWith("FAILURE:"))
      return { success: false, reason: result.slice(8).trim() };
    return {
      success: false,
      reason: `Unexpected agent response: ${result.slice(0, 100)}`,
    };
  } finally {
    await client.close();
  }
}
