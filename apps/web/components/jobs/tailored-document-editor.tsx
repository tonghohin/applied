"use client";

import { DeleteTailoredDocumentButton } from "@/components/jobs/delete-tailored-document-button";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useGenerateTailoredDocuments } from "@/hooks/use-generate-tailored-documents";
import { TAILORED_DOCUMENT_LABELS, tailoredDocumentUrl } from "@/lib/tailored-documents";
import { type TailoredDocument, trpc } from "@/lib/trpc";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  RiDownload2Line,
  RiExternalLinkLine,
  RiRefreshLine,
  RiSparklingLine,
} from "@remixicon/react";
import type { TailoredDocumentKind } from "@repo/shared";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const schema = z.object({
  content: z.string().trim().min(1, "Required"),
});

type FormValues = z.infer<typeof schema>;

const FORMAT_HINTS: Record<TailoredDocumentKind, string> = {
  resume:
    "Markdown: # for your name, ## for sections, ### for roles, - for bullets. Save to update the preview.",
  cover_letter: "Separate paragraphs with a blank line. Save to update the preview.",
};

export function TailoredDocumentEditor({
  jobId,
  kind,
  document,
  onDirtyChange,
}: {
  jobId: string;
  kind: TailoredDocumentKind;
  document: TailoredDocument | null;
  onDirtyChange: (kind: TailoredDocumentKind, isDirty: boolean) => void;
}) {
  if (!document) return <MissingDocument jobId={jobId} kind={kind} />;

  // Remount on every save/regenerate so the form resets to the stored content
  return (
    <DocumentForm
      key={`${document.id}-${document.updatedAt.getTime()}`}
      jobId={jobId}
      document={document}
      onDirtyChange={onDirtyChange}
    />
  );
}

function MissingDocument({ jobId, kind }: { jobId: string; kind: TailoredDocumentKind }) {
  const { generate, isGenerating: isGeneratingKind } = useGenerateTailoredDocuments(jobId);
  const isGenerating = isGeneratingKind(kind);
  const label = TAILORED_DOCUMENT_LABELS[kind].toLowerCase();

  return (
    <Empty className="h-full border">
      <EmptyHeader>
        <EmptyTitle>No tailored {label} yet</EmptyTitle>
        <EmptyDescription>
          Generate a {label} tailored to this job from your resume. You can edit it before
          downloading.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button disabled={isGenerating} onClick={() => generate([kind])}>
          {isGenerating ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <RiSparklingLine data-icon="inline-start" />
          )}
          {isGenerating ? "Generating…" : `Generate ${label}`}
        </Button>
      </EmptyContent>
    </Empty>
  );
}

function DocumentForm({
  jobId,
  document,
  onDirtyChange,
}: {
  jobId: string;
  document: TailoredDocument;
  onDirtyChange: (kind: TailoredDocumentKind, isDirty: boolean) => void;
}) {
  const utils = trpc.useUtils();
  const saveMutation = trpc.jobs.saveTailoredDocument.useMutation();
  const { generate, isGenerating: isGeneratingKind } = useGenerateTailoredDocuments(jobId);
  // Only this document's generation; the other tab can generate at the same time
  const isGenerating = isGeneratingKind(document.kind);
  const [regeneratePopoverOpen, setRegeneratePopoverOpen] = useState(false);
  const label = TAILORED_DOCUMENT_LABELS[document.kind];
  const fieldId = `tailored-${document.kind}`;
  const previewUrl = tailoredDocumentUrl(jobId, document);

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { content: document.content },
  });

  useEffect(() => {
    onDirtyChange(document.kind, isDirty);
  }, [document.kind, isDirty, onDirtyChange]);

  useEffect(() => {
    return () => onDirtyChange(document.kind, false);
  }, [document.kind, onDirtyChange]);

  async function onSubmit(values: FormValues) {
    try {
      await saveMutation.mutateAsync({ jobId, kind: document.kind, content: values.content });
      await utils.jobs.tailoredDocuments.invalidate({ jobId });
      toast.success(`${label} saved`);
    } catch (error) {
      toast.error(`Failed to save ${label.toLowerCase()}`, {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  }

  async function handleRegenerate() {
    setRegeneratePopoverOpen(false);
    await generate([document.kind]);
  }

  const isSaving = isSubmitting || saveMutation.isPending;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex h-full min-h-0 flex-col gap-3">
      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-2">
        <Field data-invalid={!!errors.content} className="flex min-h-0 flex-col">
          <FieldLabel htmlFor={fieldId}>{label}</FieldLabel>
          <Textarea
            id={fieldId}
            className="field-sizing-fixed min-h-[50vh] flex-1 resize-none font-mono text-xs lg:min-h-0"
            {...register("content")}
            aria-invalid={!!errors.content}
          />
          <FieldDescription>{FORMAT_HINTS[document.kind]}</FieldDescription>
          <FieldError errors={[errors.content]} />
        </Field>

        <div className="flex min-h-0 flex-col gap-2">
          <p className="font-medium text-sm">
            Preview
            {isDirty && (
              <span className="ml-2 font-normal text-muted-foreground text-xs">
                Showing the last saved version
              </span>
            )}
          </p>
          <iframe
            title={`${label} preview`}
            // Viewer hints: hide the thumbnail sidebar and fit the page to the pane width
            src={`${previewUrl}#navpanes=0&view=FitH`}
            className="hidden min-h-0 w-full flex-1 rounded-lg border bg-white lg:block"
          />
          {/* Mobile browsers render only the first page of a PDF inside an iframe */}
          <Button
            variant="outline"
            className="w-fit lg:hidden"
            nativeButton={false}
            render={(props) => (
              <a {...props} href={previewUrl} target="_blank" rel="noopener noreferrer" />
            )}
          >
            <RiExternalLinkLine data-icon="inline-start" />
            Open PDF
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <DeleteTailoredDocumentButton
          jobId={jobId}
          kind={document.kind}
          disabled={isGenerating || isSaving}
        />
        <Popover open={regeneratePopoverOpen} onOpenChange={setRegeneratePopoverOpen}>
          <PopoverTrigger
            render={<Button type="button" variant="ghost" disabled={isGenerating || isSaving} />}
          >
            {isGenerating ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <RiRefreshLine data-icon="inline-start" />
            )}
            {isGenerating ? "Regenerating…" : "Regenerate"}
          </PopoverTrigger>
          <PopoverContent initialFocus={false}>
            <PopoverHeader>
              <PopoverTitle>Regenerate {label.toLowerCase()}?</PopoverTitle>
              <PopoverDescription>
                Replaces this {label.toLowerCase()} with a new version, including any edits you've
                made.
              </PopoverDescription>
            </PopoverHeader>
            <Button type="button" size="xs" variant="outline" onClick={handleRegenerate}>
              Regenerate
            </Button>
          </PopoverContent>
        </Popover>
        <Button
          variant="outline"
          nativeButton={false}
          render={(props) => (
            <a
              {...props}
              href={tailoredDocumentUrl(jobId, document, { download: true })}
              download
            />
          )}
        >
          <RiDownload2Line data-icon="inline-start" />
          Download PDF
        </Button>
        <Button type="submit" disabled={!isDirty || isSaving || isGenerating}>
          {isSaving ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}
