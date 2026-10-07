import type { TailoredDocument, TailoredDocuments } from "@/lib/trpc";
import type { TailoredDocumentKind } from "@repo/shared";

export const TAILORED_DOCUMENT_LABELS: Record<TailoredDocumentKind, string> = {
  resume: "Resume",
  cover_letter: "Cover letter",
};

export function tailoredDocumentFor(
  documents: TailoredDocuments | undefined,
  kind: TailoredDocumentKind
): TailoredDocument | null {
  if (!documents) return null;
  return kind === "resume" ? documents.resume : documents.coverLetter;
}

// `v` changes on every save/regenerate, so the preview iframe and downloads never show a stale PDF
export function tailoredDocumentUrl(
  jobId: string,
  document: TailoredDocument,
  { download = false }: { download?: boolean } = {}
): string {
  const params = new URLSearchParams({ v: String(document.updatedAt.getTime()) });
  if (download) params.set("download", "1");
  return `/api/jobs/${jobId}/documents/${document.kind}?${params}`;
}
