import { generateText } from "ai";
import { stripCodeFences } from "./strip-code-fences";
import {
  NO_FABRICATION_RULE,
  type TailoringJob,
  jobSection,
  tailoringModel,
} from "./tailoring-job";

const RESUME_INSTRUCTIONS = `You tailor resumes to a specific job so they pass applicant tracking systems (ATS) and read well to recruiters.

${NO_FABRICATION_RULE}

The candidate's resume may be a long master document listing everything they have done. Treat it as source material, not a draft to shorten: choose the roles, bullets, projects, and skills that best support this job and leave the rest out, rather than trimming every section evenly.

What you may do:
- Reorder sections, roles' bullets, and skills so the most job-relevant material comes first.
- Reword bullets to use the job description's terminology where the resume already supports it (e.g. "k8s" -> "Kubernetes" when the job says Kubernetes).
- Write a 2-3 sentence Summary aimed at this role, using only facts from the resume.
- Drop or condense content that is irrelevant to this job.

Output format — return ONLY markdown in exactly this structure, with no code fences and no commentary:
## Full Name
email | phone | city, region | LinkedIn URL | other links (only those present in the resume or contact details)

## Summary
...

## Experience
### Job Title — Company | Start – End
- Achievement-focused bullet starting with a strong verb

## Skills
Comma-separated skills, most relevant first

## Education
### Degree — School | Year

Add other sections (Projects, Certifications, Publications, Volunteering) only if the resume has them, using the same ## / ### / - structure.

Style rules:
- Plain text only: no tables, images, emojis, icons, or columns. Use "-" for bullets.
- No first-person pronouns ("I", "my").
- Keep dates exactly as the resume states them.
- Aim for one page for under ten years of experience; never more than two.`;

export async function tailorResume({
  resume,
  job,
  contactLines = [],
  apiKey,
}: {
  resume: string;
  job: TailoringJob;
  contactLines?: string[];
  apiKey: string;
}): Promise<string> {
  const contactSection =
    contactLines.length > 0
      ? `\n\nCandidate contact details (use these only if the resume lacks them):\n${contactLines.join("\n")}`
      : "";

  const { text } = await generateText({
    model: tailoringModel(apiKey),
    instructions: RESUME_INSTRUCTIONS,
    prompt: `${jobSection(job)}\n\nCandidate resume:\n${resume}${contactSection}`,
    telemetry: { isEnabled: true, functionId: "tailor-resume" },
  });

  return stripCodeFences(text);
}
