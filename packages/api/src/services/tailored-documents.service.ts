import { describeAiError, isAiKeyError } from "@repo/ai/errors";
import { tailorCoverLetter, tailorResume } from "@repo/ai/tailoring";
import {
  type TailoredDocument,
  deleteTailoredDocument as deleteTailoredDocumentRow,
  getJobForUser,
  getProfileWithEmailForUser,
  getTailoredDocument,
  getTailoredDocumentsForJob,
  upsertTailoredDocument,
} from "@repo/db";
import {
  contactLinesFor,
  documentFileName,
  renderCoverLetterPdf,
  renderResumePdf,
} from "@repo/documents";
import { TAILORED_DOCUMENT_KINDS, type TailoredDocumentKind } from "@repo/shared";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { Context } from "../context";
import { getAiGatewayKey } from "./profile.service";

type Db = Context["db"];
type ProfileWithEmail = NonNullable<Awaited<ReturnType<typeof getProfileWithEmailForUser>>>;

export const tailoredDocumentKindSchema = z.enum(TAILORED_DOCUMENT_KINDS);

export const tailoredDocumentsInputSchema = z.object({ jobId: z.uuid() });

export const generateTailoredDocumentsSchema = z.object({
  jobId: z.uuid(),
  kinds: z.array(tailoredDocumentKindSchema).min(1),
});

export const deleteTailoredDocumentSchema = z.object({
  jobId: z.uuid(),
  kind: tailoredDocumentKindSchema,
});

export const saveTailoredDocumentSchema = z.object({
  jobId: z.uuid(),
  kind: tailoredDocumentKindSchema,
  content: z.string().trim().min(1, "Content can't be empty").max(20000),
});

const KIND_LABELS: Record<TailoredDocumentKind, string> = {
  resume: "resume",
  cover_letter: "cover letter",
};

function applicantName(profile: ProfileWithEmail): string {
  return [profile.firstName, profile.lastName].filter(Boolean).join(" ");
}

async function requireOwnedJob(db: Db, userId: string, jobId: string) {
  const job = await getJobForUser(db, jobId, userId);
  if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
  return job;
}

export async function getTailoredDocuments(db: Db, userId: string, jobId: string) {
  const rows = await getTailoredDocumentsForJob(db, jobId, userId);
  const byKind = (kind: TailoredDocumentKind): TailoredDocument | null =>
    rows.find((row) => row.kind === kind) ?? null;
  return { resume: byKind("resume"), coverLetter: byKind("cover_letter") };
}

async function generateOrThrow(kind: TailoredDocumentKind, generate: () => Promise<string>) {
  try {
    const content = await generate();
    if (!content) throw new Error("The model returned an empty document");
    return content;
  } catch (error) {
    // A rejected key is the user's to fix in Settings, not a server fault
    throw new TRPCError({
      code: isAiKeyError(error) ? "PRECONDITION_FAILED" : "INTERNAL_SERVER_ERROR",
      message: `Failed to generate ${KIND_LABELS[kind]}: ${describeAiError(error)}`,
      cause: error,
    });
  }
}

export async function generateTailoredDocuments(
  db: Db,
  userId: string,
  input: z.infer<typeof generateTailoredDocumentsSchema>
) {
  const job = await requireOwnedJob(db, userId, input.jobId);
  if (!job.description) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "This job has no description to tailor against",
    });
  }

  const [profile, apiKey] = await Promise.all([
    getProfileWithEmailForUser(db, userId),
    getAiGatewayKey(db, userId),
  ]);
  if (!profile?.resume) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Add your resume in Settings first",
    });
  }
  if (!apiKey) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Add your AI Gateway key in Settings → AI",
    });
  }

  const wantsResume = input.kinds.includes("resume");
  const wantsCoverLetter = input.kinds.includes("cover_letter");

  // Generate everything before saving anything, so a failure never leaves a half-updated pair
  const resume = wantsResume
    ? await generateOrThrow("resume", () =>
        tailorResume({
          resume: profile.resume,
          job,
          contactLines: contactLinesFor(profile),
          apiKey,
        })
      )
    : null;

  let coverLetter: string | null = null;
  if (wantsCoverLetter) {
    // Write the letter from the tailored resume so the two documents tell the same story
    const sourceResume =
      resume ??
      (await getTailoredDocument(db, job.id, userId, "resume"))?.content ??
      profile.resume;
    coverLetter = await generateOrThrow("cover_letter", () =>
      tailorCoverLetter({
        resume: sourceResume,
        job,
        instructions: profile.coverLetterInstructions,
        apiKey,
      })
    );
  }

  await Promise.all([
    resume
      ? upsertTailoredDocument(db, { userId, jobId: job.id, kind: "resume", content: resume })
      : null,
    coverLetter
      ? upsertTailoredDocument(db, {
          userId,
          jobId: job.id,
          kind: "cover_letter",
          content: coverLetter,
        })
      : null,
  ]);

  return getTailoredDocuments(db, userId, job.id);
}

export async function saveTailoredDocument(
  db: Db,
  userId: string,
  input: z.infer<typeof saveTailoredDocumentSchema>
) {
  await requireOwnedJob(db, userId, input.jobId);
  const saved = await upsertTailoredDocument(db, { userId, ...input });
  if (!saved) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to save document" });
  }
  return saved;
}

export async function renderTailoredDocumentPdf(
  db: Db,
  userId: string,
  jobId: string,
  kind: TailoredDocumentKind
): Promise<{ pdf: Buffer; fileName: string } | null> {
  const [document, profile, job] = await Promise.all([
    getTailoredDocument(db, jobId, userId, kind),
    getProfileWithEmailForUser(db, userId),
    getJobForUser(db, jobId, userId),
  ]);
  if (!document || !profile || !job) return null;

  const name = applicantName(profile);
  const pdf =
    kind === "resume"
      ? await renderResumePdf({ markdown: document.content, applicantName: name })
      : await renderCoverLetterPdf({
          body: document.content,
          applicantName: name,
          date: document.updatedAt,
        });
  return { pdf, fileName: documentFileName({ applicantName: name, kind, company: job.company }) };
}

export async function deleteTailoredDocument(
  db: Db,
  userId: string,
  input: z.infer<typeof deleteTailoredDocumentSchema>
) {
  await requireOwnedJob(db, userId, input.jobId);
  await deleteTailoredDocumentRow(db, input.jobId, userId, input.kind);
  return getTailoredDocuments(db, userId, input.jobId);
}
