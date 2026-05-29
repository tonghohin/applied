import type { Job, Profile } from "@repo/db";
import { generateText, stepCountIs } from "ai";
import { createPlaywrightMCPClient } from "../mcp";

export type ApplyResult = { success: true } | { success: false; reason: string };

export type ProfileWithEmail = Profile & { email: string };

type ApplyPlatform = "linkedin" | "greenhouse" | "lever" | "ashby" | "generic";

function detectPlatform(url: string): ApplyPlatform {
  if (url.includes("linkedin.com")) return "linkedin";
  if (url.includes("greenhouse.io")) return "greenhouse";
  if (url.includes("lever.co")) return "lever";
  if (url.includes("ashbyhq.com")) return "ashby";
  return "generic";
}

const FORM_FILLING_RULES = `## Form filling rules
- Use the resume content to answer questions about experience, skills, and education.
- When a cover letter field is required, write a personalized cover letter for the specific company and position based on the applicant's resume. If COVER LETTER INSTRUCTIONS are provided, follow them (tone, length, emphasis, etc.).
- For yes/no questions about work authorization: answer "Yes" (authorized to work).
- For yes/no questions about sponsorship: answer based on the applicant's profile — "Yes" if they require sponsorship, "No" if they do not.
- If a required field cannot be answered from the profile, use a reasonable placeholder.
- If a file upload field for a resume appears and a Resume PDF path is provided in the prompt, use browser_file_chooser to upload that file. For any other file upload fields, skip them.

Only respond with SUCCESS or FAILURE:<reason> after attempting the application — nothing else.`;

const LINKEDIN_PROMPT = `You are an automated job application agent. Navigate to a LinkedIn job page and submit the application using the applicant's profile.

## Instructions
1. Navigate to the job URL using browser_navigate.
2. Take a snapshot with browser_snapshot to understand the page.
3. If an "Easy Apply" button is present:
   - Click it to open the Easy Apply modal.
   - The modal is a multi-step wizard. Take a snapshot after each action to see the current step.
   - Fill each required field on the current step before clicking "Next" or "Review".
   - On the final review step, click "Submit application".
4. If only an "Apply" button (not "Easy Apply") is present:
   - Click it — it will open an external application page.
   - Take a snapshot after the redirect to identify the ATS, then apply the matching rules below:
     - Greenhouse (greenhouse.io): fill name, email, phone, resume upload, LinkedIn URL, cover letter textarea, custom questions; click the submit button at the bottom.
     - Lever (lever.co): fill name, email, phone, current company, resume upload, LinkedIn URL, social links, cover letter textarea, custom questions; click Apply.
     - Ashby (ashbyhq.com): fill personal info, resume upload, custom questions; click submit.
     - Other: fill required fields only and submit.
   - If account creation is required before applying, respond with FAILURE:account creation required.
5. If a CAPTCHA or verification challenge appears, respond with FAILURE:CAPTCHA detected.
6. Do not take an extra snapshot after every keystroke — batch related fields and snapshot only when needed.

${FORM_FILLING_RULES}`;

const GREENHOUSE_PROMPT = `You are an automated job application agent. Navigate to a Greenhouse job application page and submit the application using the applicant's profile.

## Instructions
1. Navigate to the job URL using browser_navigate.
2. Take a snapshot to understand the form layout.
3. No login is required — fill the form directly.
4. Typical field order: name, email, phone, resume upload, LinkedIn URL, website, cover letter textarea, custom questions at the bottom.
5. Fill required fields only — skip optional fields.
6. Do not take an extra snapshot after every keystroke — batch related fields and snapshot only when needed.
7. Before submitting, take a snapshot to confirm all required fields are filled, then click the submit button at the bottom.
8. If account creation is required before applying, respond with FAILURE:account creation required.

${FORM_FILLING_RULES}`;

const LEVER_PROMPT = `You are an automated job application agent. Navigate to a Lever job application page and submit the application using the applicant's profile.

## Instructions
1. Navigate to the job URL using browser_navigate.
2. Take a snapshot to understand the form layout.
3. No login is required — fill the form directly.
4. Typical fields: full name, email, phone, current company, resume upload, LinkedIn URL, social links, cover letter textarea, custom questions.
5. Fill required fields only — skip optional fields.
6. Do not take an extra snapshot after every keystroke — batch related fields and snapshot only when needed.
7. Before submitting, take a snapshot to confirm required fields are filled, then click the Apply button.
8. If account creation is required before applying, respond with FAILURE:account creation required.

${FORM_FILLING_RULES}`;

const ASHBY_PROMPT = `You are an automated job application agent. Navigate to an Ashby job application page and submit the application using the applicant's profile.

## Instructions
1. Navigate to the job URL using browser_navigate.
2. Take a snapshot to understand the form layout.
3. No login is required — fill the form directly.
4. Typical fields: personal info (name, email, phone), resume upload, custom questions.
5. Fill required fields only — skip optional fields.
6. Do not take an extra snapshot after every keystroke — batch related fields and snapshot only when needed.
7. Before submitting, take a snapshot to confirm required fields are filled, then click the submit button.
8. If account creation is required before applying, respond with FAILURE:account creation required.

${FORM_FILLING_RULES}`;

const GENERIC_PROMPT = `You are an automated job application agent. Navigate to a job application page and submit the application using the applicant's profile.

## Instructions
1. Navigate to the job URL using browser_navigate.
2. Take a snapshot to assess the form.
3. Fill required fields only — skip optional fields.
4. For multi-step forms, complete each step in sequence.
5. Do not take an extra snapshot after every keystroke — batch related fields and snapshot only when needed.
6. If account creation is required before applying, respond with FAILURE:account creation required.
7. If you reach a page that requires information you cannot supply (e.g. a work permit number, background check consent gate, or government ID), respond with FAILURE:<specific blocker>.

${FORM_FILLING_RULES}`;

const PROMPTS: Record<ApplyPlatform, string> = {
  linkedin: LINKEDIN_PROMPT,
  greenhouse: GREENHOUSE_PROMPT,
  lever: LEVER_PROMPT,
  ashby: ASHBY_PROMPT,
  generic: GENERIC_PROMPT,
};

export async function applyToJob(
  job: Job,
  profile: ProfileWithEmail,
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
      `Email: ${profile.email}`,
      `Phone: ${profile.phone}`,
      `Address: ${profile.address}`,
      `Requires visa sponsorship: ${profile.requiresSponsorship ? "Yes" : "No"}`,
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

    const platform = detectPlatform(job.url);
    log(`Platform detected: ${platform}`);

    const { text } = await generateText({
      model: "google/gemini-2.5-flash",
      tools,
      stopWhen: stepCountIs(100),
      system: PROMPTS[platform],
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
