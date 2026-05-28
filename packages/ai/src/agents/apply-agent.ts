import type { Job, Profile } from "@repo/db";
import { generateText, stepCountIs } from "ai";
import { createPlaywrightMCPClient } from "../mcp";

export type ApplyResult = { success: true } | { success: false; reason: string };

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
- If only an "Apply" button (not "Easy Apply") is present, click it — it will open an external application page. Continue applying there following the External application rules below.
- If a CAPTCHA or verification challenge appears, respond with FAILURE:CAPTCHA detected.

## External application rules
- After navigating to an external site, immediately take a snapshot to assess the form.
- If the site requires creating an account before applying, create one using the applicant's email and a generated password (FirstName + LastName + 2024!).
- Fill required fields only — skip optional fields to save steps.
- For multi-step forms, complete each step in sequence without re-reading fields you already filled.
- Do not take an extra snapshot after every single keystroke — batch related fields and snapshot only when you need to see the current state before acting.
- If the form redirects to a third-party ATS (Greenhouse, Lever, Workday, iCIMS, etc.), continue filling it out — these are standard and completable.
- If you reach a page that requires information you cannot supply (e.g., a work permit number, background check consent gate, or government ID), respond with FAILURE:<specific blocker>.

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
  linkedinSessionJson?: string,
  log: (msg: string) => void = () => {}
): Promise<ApplyResult> {
  log("Initializing Playwright session");
  const client = await createPlaywrightMCPClient(linkedinSessionJson);

  try {
    const tools = await client.tools();

    if (linkedinSessionJson) {
      log("Session restored from saved state");
    } else {
      log("Starting fresh session");
    }

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

    log("AI agent running (up to 100 steps)");
    const { text } = await generateText({
      model: "google/gemini-2.5-flash",
      tools,
      stopWhen: stepCountIs(100),
      system: SYSTEM_PROMPT,
      prompt: `Apply to this job:\nURL: ${job.url}\nTitle: ${job.title} at ${job.company}\n\nApplicant profile:\n${profileSummary}${resumePdfPath ? `\n\nResume PDF path: ${resumePdfPath}` : ""}`,
      experimental_telemetry: { isEnabled: true },
    });
    log("AI agent finished");

    const result = text.trim();
    if (result === "SUCCESS") return { success: true };
    if (result.startsWith("FAILURE:")) return { success: false, reason: result.slice(8).trim() };
    if (!result)
      return {
        success: false,
        reason: "Agent reached step limit without completing the application",
      };
    return {
      success: false,
      reason: `Unexpected agent response: ${result.slice(0, 100)}`,
    };
  } finally {
    await client.close();
  }
}
