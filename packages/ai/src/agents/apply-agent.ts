import type { Job, Profile } from "@repo/db";
import { toTitleCase } from "@repo/shared";
import { type ModelMessage, Output, generateText, stepCountIs, tool } from "ai";
import { z } from "zod";
import { createPlaywrightMCPClient } from "../mcp";
import { generateCoverLetter } from "./generate-cover-letter";

const applyResultSchema = z.object({
  success: z
    .boolean()
    .describe(
      "True only if you observed an explicit confirmation — URL changed to a thank-you/success path, or the page shows a 'Thank you' / 'Application submitted' heading. False otherwise."
    ),
  reason: z
    .string()
    .optional()
    .describe(
      "Required when success is false: the specific reason (e.g. 'form did not redirect after submit', 'CAPTCHA detected', 'account creation required'). Optional when success is true, but include a note for edge cases like duplicate submissions."
    ),
});

export type ApplyResult = z.infer<typeof applyResultSchema>;

export type ProfileWithEmail = Profile & { email: string };

type ApplyPlatform = "linkedin" | "greenhouse" | "lever" | "ashby" | "bamboohr" | "generic";

function detectPlatform(url: string): ApplyPlatform {
  if (url.includes("linkedin.com")) return "linkedin";
  if (url.includes("greenhouse.io")) return "greenhouse";
  if (url.includes("lever.co")) return "lever";
  if (url.includes("ashbyhq.com")) return "ashby";
  if (url.includes("bamboohr.com")) return "bamboohr";
  return "generic";
}

const FORM_FILLING_RULES = `## Form filling rules
- Use the resume content to answer questions about experience, skills, and education.
- When a cover letter field is required, call generate_cover_letter to obtain the cover letter text, then type the returned text into the field.
- For yes/no questions about work authorization: answer "Yes" (authorized to work).
- For yes/no questions about sponsorship: answer based on the applicant's profile — "Yes" if they require sponsorship, "No" if they do not.
- For open-ended questions (e.g. "Why do you want to work here?", "Describe a challenging project", "What interests you about this role?"): write the answer in first person as the applicant, grounded in the resume and the job details. Be specific — reference actual skills, projects, or experience from the resume and connect them to the role or company. Keep it to 2-4 sentences unless the field indicates a longer answer is expected. Never mention being an AI or an automated agent.
- For "How did you hear about us?" questions: answer "LinkedIn" (select it if it is a dropdown option, otherwise type it).
- For notice period / availability / start date questions: answer with the applicant's notice period from the profile, or the nearest equivalent option.
- For demographic / EEO / self-identification questions (gender, race, ethnicity, veteran status, disability, sexual orientation): select "Prefer not to answer", "Decline to self-identify", or the closest equivalent option. Only if the field is required and no decline option exists, leave it at the default or pick the most neutral option. Never guess demographic information about the applicant.
- If a required field still cannot be answered from any of the above, use a reasonable placeholder.
- If a file upload field for a resume appears and a Resume PDF path is provided in the prompt, use browser_file_upload to upload that file. For any other file upload fields, skip them.
- Before filling any text field, check its current value in the snapshot. If it already contains the correct value (forms often pre-fill phone, email, or name from the account or a previous application), SKIP it — do not type into it again. If it contains a wrong or partial value, clear it first with "Control+a" then type the correct value. Never type into a non-empty field without clearing it.
- Fill text fields one at a time. Do not use browser_fill_form or browser_type.
- Before interacting with any field or button, ALWAYS first use browser_hover to move the mouse over the element, then click it. This simulates natural mouse movement and is required to avoid spam detection.
- To fill a text field: hover the element → click it to focus → press "Control+a" with browser_press_key to select all existing content → use browser_press_sequentially with delay:80 to type the new value character by character. The delay:80 parameter simulates human typing speed and is critical — do not omit it.
- NEVER use Backspace or Delete to clear a field character by character. Always use "Control+a" (selects all) before typing — this replaces whatever was there in a single keystroke.
- After filling each text field, add a browser_wait_for with time:600 before moving to the next field.
- Only use browser_type as a fallback if browser_press_sequentially fails on a specific field.
- For location/address/city autocomplete fields: after typing the value, use browser_wait_for with a short text condition to wait for the dropdown to appear, then press "ArrowDown" and "Enter" with browser_press_key to select the first autocomplete suggestion. If no autocomplete dropdown appears, the typed value is accepted as-is.
- When targeting elements from a snapshot, use the bare ref value as the target (e.g. if the snapshot shows [ref=e123], use target: "e123"). Never use "ref=e123" or "[ref=e123]" as a selector — those are invalid.
- Prefer targeting by accessible role and name when refs fail: use getByRole("button", { name: "Submit" }) or getByRole("textbox", { name: "Email" }) syntax as the target value.
- For resume file upload: click the upload button first to open the file dialog, then immediately call browser_file_upload with the resume PDF path. Do not call browser_file_upload before triggering the dialog.
- Do not take a snapshot unless the page has changed (after a navigation, click, or form submission). Never take consecutive snapshots without an action in between.
- When clicking multiple checkboxes or radio buttons in sequence, add a browser_wait_for with time:1500 between each click. This avoids triggering spam/bot detection heuristics that flag rapid consecutive clicks.

## Dropdown fields
Many modern ATS forms use custom React/styled dropdowns that are NOT native <select> elements — browser_select_option will NOT work on them. To select an option from a custom dropdown:
1. Click the dropdown trigger to open it.
2. Take a snapshot to confirm the options list is visible.
3. Click the desired option directly by ref or by text.
If the dropdown has a search/filter input, type the value, wait for the option to appear, then click it or press ArrowDown + Enter.

## Phone country code fields
Phone inputs often have a country code selector before the number. Set it to Canada (+1) by: click the selector → wait for the list → click "Canada +1". If already set correctly, skip it.

## Salary fields
Enter a single integer (e.g. 120000). Never enter ranges, currency codes, or text like "Competitive". Use the "Expected salary" value from the applicant profile.

## Verifying submission success (required)
After clicking the final submit button:
1. Take a snapshot immediately to check for inline validation errors. If errors are present and fixable, fix them and retry submit.
2. If no validation errors, take a snapshot after a few seconds to check the page state.
3. Look at the page URL and the snapshot content to determine the outcome.

Return { success: true } ONLY IF you can confirm ONE of the following — do not guess:
- The page URL changed to a different path (e.g. /thank-you, /confirmation, /success, /complete, /applied, /submitted). A URL still ending in /apply or the same path as the form means the form did NOT submit.
- OR the accessibility snapshot clearly shows a heading, alert, or prominent text containing "Thank you", "Application submitted", "Application received", "Application complete", or similar explicit confirmation.

Return { success: false, reason: "..." } in these cases:
- The URL is still on the application/form page AND no confirmation text is visible in the snapshot → reason: "form did not redirect after submit; page URL unchanged"
- browser_wait_for timed out waiting for a confirmation element → reason: "confirmation did not appear after submission"
- Inline validation errors remain → reason: the specific validation error message
- Never infer success from completing the form or clicking submit alone — you must see the confirmation.

## Spam detection recovery
If the ATS shows a "flagged as spam" or "possible spam" error with a suggestion to try again (common on Ashby): use browser_wait_for with time:8000 to wait 8 seconds, then click the submit button one more time (this is the ATS's own retry flow, and it needs time to clear the rate limit). If it is flagged a second time, return { success: false, reason: "flagged as spam by ATS" }.

## Submission retry limit
Never submit the same form more than 2 times. If the form fails validation twice, identify the specific failing field from the error message, attempt ONE targeted fix, then submit a third and final time. If it still fails, return { success: false, reason: "<specific validation error>" } immediately. Repeated submission attempts trigger CAPTCHA and bot detection — failing fast is better than looping.

## Detecting already-applied (409 duplicate) responses
Some ATSes (including Breezy HR) silently return HTTP 409 when you've already applied with the same email — the page looks unchanged but the application was already in their system.
After clicking submit and the page doesn't redirect, use browser_network_requests to inspect the most recent POST request to the apply endpoint. If any request to the apply endpoint returned status 409, return { success: true, reason: "already applied (duplicate submission rejected by ATS — original application is on file)" }.

## Final response
After verifying the outcome, return a JSON object with:
- success: true if the application was submitted successfully, false otherwise
- reason: (optional) a short description of the failure, or a note for successful edge cases like duplicate submissions`;

const LINKEDIN_PROMPT = `You are an automated job application agent. Submit a LinkedIn job application using the applicant's profile.

## Instructions
1. The browser is already loaded on the job URL. Take a browser_snapshot to see the current page state.
2. If an "Easy Apply" button is present:
   - Click it to open the Easy Apply modal.
   - The modal is a multi-step wizard. Take a snapshot after each action to see the current step.
   - Fill each required field on the current step before clicking "Next" or "Review".
   - LinkedIn pre-fills contact info (email, phone country code, phone number) from the account. If a field already shows the correct value in the snapshot, leave it untouched — do not re-type or append to it.
   - On the final review step, click "Submit application".
3. If only an "Apply" button (not "Easy Apply") is present:
   - Click it — it will open an external application page in a new tab.
   - Use browser_tabs to switch to the new tab, then take a snapshot to identify the ATS.
   - Apply the matching rules below:
     - Greenhouse (greenhouse.io): fill name, email, phone, resume upload, LinkedIn URL, cover letter textarea, custom questions; click the submit button at the bottom.
     - Lever (lever.co): fill name, email, phone, current company, resume upload, LinkedIn URL, social links, cover letter textarea, custom questions; click Apply.
     - Ashby (ashbyhq.com): fill personal info, resume upload, custom questions; click submit.
     - Breezy HR (breezy.hr): multi-step form — fill each page's required fields, click Next/Continue until the final step, then click Submit. After submitting, confirm the URL changed to a thank-you page.
     - BambooHR (bamboohr.com): single-page form — fill name, email, phone, address, resume upload, LinkedIn URL, cover letter textarea, custom questions; click the Submit Application button.
     - Gem (jobs.gem.com): single-page form — fill all visible required fields (name, email, phone, resume, custom questions), then click the submit button.
     - Other: fill required fields only and submit.
   - If account creation is required before applying, respond with FAILURE:account creation required.
   - IMPORTANT: Once you have opened the external application tab, do NOT navigate back to LinkedIn or click "Apply on company website" again. If you accidentally land on LinkedIn, use browser_navigate to go directly back to the external application URL (visible in the tab list from your last snapshot).
4. If a CAPTCHA or verification challenge appears, respond with FAILURE:CAPTCHA detected.
5. Do not take an extra snapshot after every keystroke — batch related fields and snapshot only when needed.

${FORM_FILLING_RULES}`;

const GREENHOUSE_PROMPT = `You are an automated job application agent. Submit a Greenhouse job application using the applicant's profile.

## Instructions
1. The browser is already loaded on the job URL. Take a browser_snapshot to understand the form layout.
2. No login is required — fill the form directly.
3. Typical field order: name, email, phone, resume upload, LinkedIn URL, website, cover letter textarea, custom questions at the bottom.
4. Fill required fields only — skip optional fields.
5. Do not take an extra snapshot after every keystroke — batch related fields and snapshot only when needed.
6. Before submitting, take a snapshot to confirm all required fields are filled, then click the submit button at the bottom.
7. After submitting, take a snapshot to verify the URL changed to a confirmation page or a confirmation message is shown.
8. If account creation is required before applying, respond with FAILURE:account creation required.

## Greenhouse-specific: custom dropdown fields
Greenhouse forms use React Select custom dropdowns — NOT native <select> elements. browser_select_option will NOT work on them.
To select an option (e.g. "No" for sponsorship, "Yes" for work authorization):
1. Click the dropdown trigger to open it (browser_click on the dropdown container).
2. Take a snapshot to see the options list.
3. Click the desired option text directly (browser_click on the option ref).
Do NOT use browser_select_option on Greenhouse dropdowns. Do NOT loop — if the first click-open and click-option attempt does not work, try once more then skip the field.

## Greenhouse-specific: phone country code
Phone number fields often have a country code selector next to the number input. To set it to Canada: click the country code button/dropdown, wait for the option list, click "Canada +1". Do this before typing the phone number. If the country code is already set to Canada, skip it.

## Greenhouse-specific: salary fields
For salary/compensation fields, enter a single integer from the "Expected salary" in the applicant profile. Do NOT enter ranges ("120000 - 150000"), currency codes ("CAD"), or text ("Competitive"). If a currency selector exists alongside the number field, leave it at the default.

## Greenhouse-specific: navigation guard
NEVER click "Back to jobs", "Back", "Cancel", or any link that navigates away from the application form. Only click form inputs and the "Submit Application" button. If you accidentally navigate away from the form, use browser_navigate_back to return to it.

${FORM_FILLING_RULES}`;

const LEVER_PROMPT = `You are an automated job application agent. Submit a Lever job application using the applicant's profile.

## Instructions
1. The browser is already loaded on the job URL. Take a browser_snapshot to understand the form layout.
2. No login is required — fill the form directly.
3. Typical fields: full name, email, phone, current company, resume upload, LinkedIn URL, social links, cover letter textarea, custom questions.
4. Fill required fields only — skip optional fields.
5. Do not take an extra snapshot after every keystroke — batch related fields and snapshot only when needed.
6. Before submitting, take a snapshot to confirm required fields are filled, then click the Apply button.
7. After submitting, take a snapshot to verify the URL changed to a confirmation page or a confirmation message is shown.
8. If account creation is required before applying, respond with FAILURE:account creation required.

${FORM_FILLING_RULES}`;

const ASHBY_PROMPT = `You are an automated job application agent. Submit an Ashby job application using the applicant's profile.

## Instructions
1. The browser is already loaded on the job URL. Take a browser_snapshot to understand the form layout.
2. No login is required — fill the form directly.
3. Typical fields: personal info (name, email, phone), resume upload, custom questions.
4. Fill required fields only — skip optional fields.
5. Do not take an extra snapshot after every keystroke — batch related fields and snapshot only when needed.
6. Before submitting, take a snapshot to confirm required fields are filled, then click the submit button.
7. After submitting, take a snapshot to verify the URL changed to a confirmation page or a confirmation message is shown.
8. If account creation is required before applying, respond with FAILURE:account creation required.

${FORM_FILLING_RULES}`;

const BAMBOOHR_PROMPT = `You are an automated job application agent. Submit a BambooHR job application using the applicant's profile.

## Instructions
1. The browser is already loaded on the job URL. Take a browser_snapshot to understand the form layout.
2. No login is required — fill the form directly.
3. Typical fields: full name, email, phone, address, resume upload, LinkedIn URL, cover letter textarea, custom questions.
4. Fill required fields only — skip optional fields.
5. Do not take an extra snapshot after every keystroke — batch related fields and snapshot only when needed.
6. Before submitting, take a snapshot to confirm required fields are filled, then click the "Submit Application" button.
7. After submitting, take a snapshot to verify the URL changed to a confirmation page or a confirmation message is shown.
8. If account creation is required before applying, respond with FAILURE:account creation required.

## BambooHR-specific: button names
BambooHR pages have two distinct buttons — do NOT confuse them:
- "Apply for This Job" — a CTA at the top of the page that just scrolls to the form. Do NOT click this.
- "Submit Application" — the actual submit button at the bottom of the form. Click this to submit.

${FORM_FILLING_RULES}`;

const GENERIC_PROMPT = `You are an automated job application agent. Submit a job application using the applicant's profile.

## Instructions
1. The browser is already loaded on the job URL. Take a browser_snapshot to assess the form.
2. Fill required fields only — skip optional fields.
3. For multi-step forms, complete each step in sequence.
4. Do not take an extra snapshot after every keystroke — batch related fields and snapshot only when needed.
5. After submitting, take a snapshot to verify the URL changed to a confirmation page or a confirmation message is shown.
6. If account creation is required before applying, respond with FAILURE:account creation required.
7. If you reach a page that requires information you cannot supply (e.g. a work permit number, background check consent gate, or government ID), respond with FAILURE:<specific blocker>.

${FORM_FILLING_RULES}`;

const PROMPTS: Record<ApplyPlatform, string> = {
  linkedin: LINKEDIN_PROMPT,
  greenhouse: GREENHOUSE_PROMPT,
  lever: LEVER_PROMPT,
  ashby: ASHBY_PROMPT,
  bamboohr: BAMBOOHR_PROMPT,
  generic: GENERIC_PROMPT,
};

function logToolCall(
  stepNumber: number,
  toolName: string,
  args: unknown,
  log: (msg: string) => void
) {
  const argStr = JSON.stringify(args);
  const brief =
    toolName === "browser_snapshot" || toolName === "browser_tabs"
      ? ""
      : `: ${argStr.slice(0, 120)}${argStr.length > 120 ? "…" : ""}`;
  log(`[step ${stepNumber + 1}] ${toolName}${brief}`);
}

export async function applyToJob(
  job: Job,
  profile: ProfileWithEmail,
  resumePdfPath: string,
  minSalary: number,
  linkedinSessionJson?: string,
  log: (msg: string) => void = () => {}
): Promise<ApplyResult> {
  log("Initializing Playwright session");
  const client = await createPlaywrightMCPClient(linkedinSessionJson);

  try {
    log("Pre-navigating to job URL");
    const firstPage = client.browserContext.pages()[0];
    const page = firstPage !== undefined ? firstPage : await client.browserContext.newPage();
    // Always start on the job's LinkedIn page — for external (non-Easy-Apply) jobs the
    // real application URL only resolves through clicking the Apply button, which the
    // agent does itself (LinkedIn prompt, instruction 3).
    await page.goto(job.url, { waitUntil: "domcontentloaded" });
    log("Page loaded");
    const ALLOWED_TOOL_NAMES = new Set([
      "browser_navigate",
      "browser_snapshot",
      "browser_click",
      "browser_type",
      "browser_press_sequentially",
      "browser_hover",
      "browser_select_option",
      "browser_file_upload",
      "browser_press_key",
      "browser_tabs",
      "browser_close",
      "browser_wait_for",
      "browser_network_requests",
      "browser_navigate_back",
    ]);
    const tools = {
      ...Object.fromEntries(
        Object.entries(await client.tools()).filter(([name]) => ALLOWED_TOOL_NAMES.has(name))
      ),
      generate_cover_letter: tool({
        description:
          'Generate a personalized cover letter for this job application. Call this ONLY when the form has an explicit field labelled "Cover Letter" or "Cover letter". Do NOT call this for generic open-ended questions, experience descriptions, or motivation fields.',
        inputSchema: z.object({}),
        execute: async () => generateCoverLetter(job, profile),
      }),
    };

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
      `Notice period: ${toTitleCase(profile.noticePeriod)}`,
      `Expected salary: ${minSalary}`,
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

    const { output, steps } = await generateText({
      model: "google/gemini-2.5-flash",
      // Pin gateway routing to Vertex. Output.object adds a JSON responseFormat to every
      // step, and the gateway's fallback route (Google AI Studio) rejects requests that
      // combine function calling with a JSON response mime type — Vertex accepts it.
      providerOptions: { gateway: { only: ["vertex"] } },
      tools,
      stopWhen: stepCountIs(150),
      output: Output.object({ schema: applyResultSchema }),
      system: PROMPTS[platform],
      prompt: `Apply to this job:\nURL: ${job.url}\nTitle: ${job.title} at ${job.company}\n\nApplicant profile:\n${profileSummary}${resumePdfPath ? `\n\nResume PDF path: ${resumePdfPath}` : ""}`,
      experimental_telemetry: { isEnabled: true },
      prepareStep: ({ messages }) => {
        // Keep only the most recent browser_snapshot result; replace older ones with a
        // short placeholder to avoid re-sending large DOM snapshots every step.
        const snapshotIndices: number[] = [];
        for (let idx = 0; idx < messages.length; idx++) {
          const msg = messages[idx];
          if (!msg || msg.role !== "tool") continue;
          if (
            msg.content.some(
              (part) => part.type === "tool-result" && part.toolName === "browser_snapshot"
            )
          ) {
            snapshotIndices.push(idx);
          }
        }
        if (snapshotIndices.length <= 1) return {};

        const toStub = new Set(snapshotIndices.slice(0, -1));
        return {
          messages: messages.map((msg, idx): ModelMessage => {
            if (!toStub.has(idx) || msg.role !== "tool") return msg;
            return {
              ...msg,
              content: msg.content.map((part) => {
                if (part.type !== "tool-result" || part.toolName !== "browser_snapshot")
                  return part;
                return {
                  ...part,
                  output: {
                    type: "text",
                    value:
                      "[snapshot omitted — call browser_snapshot again if you need a fresh view]",
                  },
                };
              }),
            };
          }),
        };
      },
      onStepFinish: (step) => {
        for (const toolCall of step.toolCalls) {
          logToolCall(step.stepNumber, toolCall.toolName, toolCall.input, log);
        }
      },
    });
    log(`AI agent finished after ${steps.length} step(s)`);
    log(
      `Agent result: success=${output.success}${output.reason ? ` reason=${output.reason}` : ""}`
    );

    if (output.success) return { success: true };
    return { success: false, reason: output.reason ?? "Agent finished without a reason" };
  } finally {
    await client.close();
  }
}
