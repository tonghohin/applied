import { TAILORED_DOCUMENT_LABELS } from "@/lib/tailored-documents";
import { trpc } from "@/lib/trpc";
import type { TailoredDocumentKind } from "@repo/shared";
import { toast } from "sonner";

export function useGenerateTailoredDocuments(jobId: string) {
  const utils = trpc.useUtils();
  const generateMutation = trpc.jobs.generateTailoredDocuments.useMutation();

  // Resolves true on success so callers can react (e.g. open the editor) without handling errors
  async function generate(kinds: TailoredDocumentKind[]): Promise<boolean> {
    try {
      const documents = await generateMutation.mutateAsync({ jobId, kinds });
      utils.jobs.tailoredDocuments.setData({ jobId }, documents);
      const [onlyKind] = kinds;
      toast.success(
        kinds.length === 1 && onlyKind
          ? `Tailored ${TAILORED_DOCUMENT_LABELS[onlyKind].toLowerCase()} ready`
          : "Tailored resume and cover letter ready"
      );
      return true;
    } catch (error) {
      toast.error("Couldn't generate documents", {
        description: error instanceof Error ? error.message : undefined,
      });
      return false;
    }
  }

  const generatingKinds: TailoredDocumentKind[] = generateMutation.isPending
    ? (generateMutation.variables?.kinds ?? [])
    : [];

  return { generate, isGenerating: generateMutation.isPending, generatingKinds };
}
