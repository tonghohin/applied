import { TAILORED_DOCUMENT_LABELS } from "@/lib/tailored-documents";
import { trpc } from "@/lib/trpc";
import type { TailoredDocumentKind } from "@repo/shared";
import { toast } from "sonner";

export function useDeleteTailoredDocument(jobId: string) {
  const utils = trpc.useUtils();
  const deleteMutation = trpc.jobs.deleteTailoredDocument.useMutation();

  async function deleteDocument(kind: TailoredDocumentKind): Promise<boolean> {
    try {
      const documents = await deleteMutation.mutateAsync({ jobId, kind });
      utils.jobs.tailoredDocuments.setData({ jobId }, documents);
      toast.success(`${TAILORED_DOCUMENT_LABELS[kind]} deleted`);
      return true;
    } catch (error) {
      toast.error(`Couldn't delete ${TAILORED_DOCUMENT_LABELS[kind].toLowerCase()}`, {
        description: error instanceof Error ? error.message : undefined,
      });
      return false;
    }
  }

  return { deleteDocument, isDeleting: deleteMutation.isPending };
}
