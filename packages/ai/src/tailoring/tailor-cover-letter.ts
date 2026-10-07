import { generateText } from "ai";
import { stripCodeFences } from "./strip-code-fences";
import {
  NO_FABRICATION_RULE,
  type TailoringJob,
  jobSection,
  tailoringModel,
} from "./tailoring-job";

const COVER_LETTER_INSTRUCTIONS = `You are a professional cover letter writer. Write a concise, personalized cover letter for the given job and applicant.

${NO_FABRICATION_RULE}

Output rules:
- Return only the letter body as plain text: no subject line, no address block, no date, no markdown, no JSON.
- Start with "Dear Hiring Manager,".
- Separate paragraphs with a blank line.
- End with a sign-off line followed by the applicant's name on its own line.
- Three to four short paragraphs unless the instructions say otherwise.`;

export async function tailorCoverLetter({
  resume,
  job,
  instructions,
  apiKey,
}: {
  resume: string;
  job: TailoringJob;
  instructions?: string | null;
  apiKey: string;
}): Promise<string> {
  const instructionsSection = instructions
    ? `\n\nCover letter instructions (follow these for tone, length, and emphasis):\n${instructions}`
    : "";

  const { text } = await generateText({
    model: tailoringModel(apiKey),
    instructions: COVER_LETTER_INSTRUCTIONS,
    prompt: `${jobSection(job)}\n\nApplicant resume:\n${resume}${instructionsSection}`,
    telemetry: { isEnabled: true, functionId: "tailor-cover-letter" },
  });

  return stripCodeFences(text);
}
