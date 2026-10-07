import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type Db,
  type Job,
  type TailoredDocument,
  getJobCriteriaForUser,
  getJobForUser,
  getProfileWithEmailForUser,
  getTailoredDocumentsForJob,
  updateJobApplied,
  updateJobFailed,
  upsertTailoredDocument,
} from "@repo/db";
import {
  contactLinesFor,
  documentFileName,
  renderCoverLetterPdf,
  renderResumePdf,
} from "@repo/documents";
import { describeAiError } from "../errors";
import { tailorResume } from "../tailoring";
import { type ProfileWithEmail, applyToJob } from "./apply-agent";

// Both PDFs go in one temp folder, removed when the application finishes
async function writeDocumentPdf({
  dir,
  kind,
  applicantName,
  company,
  pdf,
}: {
  dir: string;
  kind: "resume" | "cover_letter";
  applicantName: string;
  company: string;
  pdf: Buffer;
}): Promise<string> {
  const pdfPath = join(dir, documentFileName({ applicantName, kind, company }));
  await writeFile(pdfPath, pdf);
  return pdfPath;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Tailored documents are the point of this tool: an application only goes out with a resume
// that was tailored to the job and saved, so the user can always see exactly what was sent.
// Anything that prevents that fails the application with a reason instead of falling back.
async function resolveResumeText({
  db,
  job,
  profile,
  savedResume,
  apiKey,
  log,
}: {
  db: Db;
  job: Job;
  profile: ProfileWithEmail;
  savedResume: TailoredDocument | undefined;
  apiKey: string;
  log: (msg: string) => void;
}): Promise<string> {
  if (savedResume) {
    log("Using tailored resume");
    return savedResume.content;
  }
  if (!job.description) {
    throw new Error("This job has no description to tailor a resume against — apply manually");
  }

  log("Generating tailored resume");
  let tailored: string;
  try {
    tailored = await tailorResume({
      resume: profile.resume,
      job,
      contactLines: contactLinesFor(profile),
      apiKey,
    });
  } catch (error) {
    throw new Error(`Couldn't generate a tailored resume: ${describeAiError(error)}`, {
      cause: error,
    });
  }
  if (!tailored) throw new Error("Couldn't generate a tailored resume: the model returned nothing");

  try {
    await upsertTailoredDocument(db, {
      userId: job.userId,
      jobId: job.id,
      kind: "resume",
      content: tailored,
    });
  } catch (error) {
    throw new Error(`Couldn't save the tailored resume: ${errorMessage(error)}`, { cause: error });
  }
  log("Using newly tailored resume");
  return tailored;
}

async function saveGeneratedCoverLetter({
  db,
  job,
  content,
  log,
}: {
  db: Db;
  job: Job;
  content: string;
  log: (msg: string) => void;
}) {
  try {
    await upsertTailoredDocument(db, {
      userId: job.userId,
      jobId: job.id,
      kind: "cover_letter",
      content,
    });
  } catch (error) {
    // Rethrown so the agent stops: a letter the user can't see must not be submitted
    throw new Error(`Couldn't save the generated cover letter: ${errorMessage(error)}`, {
      cause: error,
    });
  }
  log("Saved generated cover letter");
}

export async function processApplyJob(
  db: Db,
  jobId: string,
  userId: string,
  apiKey: string,
  linkedinSessionJson?: string,
  log: (msg: string) => void = () => {}
) {
  log("Fetching job and profile");
  const [jobRow, profileRow, criteriaRow, tailoredDocuments] = await Promise.all([
    getJobForUser(db, jobId, userId),
    getProfileWithEmailForUser(db, userId),
    getJobCriteriaForUser(db, userId),
    getTailoredDocumentsForJob(db, jobId, userId),
  ]);

  if (!jobRow) throw new Error(`Job ${jobId} not found`);
  if (!profileRow) throw new Error(`Profile for user ${userId} not found`);
  if (!criteriaRow) throw new Error(`Criteria for user ${userId} not found`);

  const resumeText = await resolveResumeText({
    db,
    job: jobRow,
    profile: profileRow,
    savedResume: tailoredDocuments.find((document) => document.kind === "resume"),
    apiKey,
    log,
  });
  const coverLetter = tailoredDocuments.find(
    (document) => document.kind === "cover_letter"
  )?.content;
  if (coverLetter) log("Using tailored cover letter");

  log("Generating resume PDF");
  const applicantName = [profileRow.firstName, profileRow.lastName].filter(Boolean).join(" ");
  const pdfDir = await mkdtemp(join(tmpdir(), "application-"));
  try {
    const resumePdfPath = await writeDocumentPdf({
      dir: pdfDir,
      kind: "resume",
      applicantName,
      company: jobRow.company,
      pdf: await renderResumePdf({ markdown: resumeText, applicantName }),
    });
    const writeCoverLetterPdf = async (content: string) =>
      writeDocumentPdf({
        dir: pdfDir,
        kind: "cover_letter",
        applicantName,
        company: jobRow.company,
        pdf: await renderCoverLetterPdf({ body: content, applicantName, date: new Date() }),
      });
    log("Launching AI agent");
    const result = await applyToJob(
      jobRow,
      profileRow,
      {
        resumePdfPath,
        resumeText,
        coverLetter,
        onCoverLetterGenerated: (content) =>
          saveGeneratedCoverLetter({ db, job: jobRow, content, log }),
        writeCoverLetterPdf,
      },
      criteriaRow.minSalary,
      linkedinSessionJson,
      log,
      apiKey
    );
    if (result.success) {
      log("Application submitted successfully");
      await updateJobApplied(db, jobId);
    } else {
      log(`Application failed: ${result.reason}`);
      await updateJobFailed(db, jobId, result.reason ?? "Unknown error");
    }
    return result;
  } finally {
    await rm(pdfDir, { recursive: true, force: true });
  }
}
