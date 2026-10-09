import { TAILORED_DOCUMENT_LABELS } from "@/lib/tailored-documents";
import { trpc } from "@/lib/trpc";
import { TAILORED_DOCUMENT_KINDS, type TailoredDocumentKind } from "@repo/shared";
import { useMutationState } from "@tanstack/react-query";
import { getMutationKey } from "@trpc/react-query";
import { toast } from "sonner";
import { z } from "zod";

const generateMutationKey = getMutationKey(trpc.jobs.generateTailoredDocuments);

// Variables of in-flight generate mutations, read back from the shared mutation cache
const generateVariablesSchema = z.object({
  jobId: z.string(),
  kinds: z.array(z.enum(TAILORED_DOCUMENT_KINDS)),
});

export function useGenerateTailoredDocuments(jobId: string) {
  const utils = trpc.useUtils();
  const generateMutation = trpc.jobs.generateTailoredDocuments.useMutation();

  // Pending state comes from the shared cache, not this hook's own mutation: the job panel is
  // remounted when switching jobs, and a generation started before switching away must still show
  // as in progress when you come back (and block starting a duplicate)
  const pendingVariables = useMutationState({
    filters: { mutationKey: generateMutationKey, status: "pending" },
    select: (mutation) => mutation.state.variables,
  });
  const generatingKinds: TailoredDocumentKind[] = pendingVariables.flatMap((variables) => {
    const parsed = generateVariablesSchema.safeParse(variables);
    return parsed.success && parsed.data.jobId === jobId ? parsed.data.kinds : [];
  });

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

  // Per document: the resume and the cover letter generate independently
  function isGenerating(kind: TailoredDocumentKind): boolean {
    return generatingKinds.includes(kind);
  }

  return { generate, isGenerating };
}
