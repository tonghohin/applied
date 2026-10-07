"use client";

import { DeleteTailoredDocumentButton } from "@/components/jobs/delete-tailored-document-button";
import { TailoredDocumentsSheet } from "@/components/jobs/tailored-documents-sheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useGenerateTailoredDocuments } from "@/hooks/use-generate-tailored-documents";
import {
  TAILORED_DOCUMENT_LABELS,
  tailoredDocumentFor,
  tailoredDocumentUrl,
} from "@/lib/tailored-documents";
import { type Job, trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { RiDownload2Line, RiFileTextLine, RiSparklingLine } from "@remixicon/react";
import { TAILORED_DOCUMENT_KINDS, type TailoredDocumentKind } from "@repo/shared";
import { formatDistanceToNow } from "date-fns";
import { useState } from "react";

export function TailoredDocumentsSection({ job }: { job: Job }) {
  const { data: documents, isLoading } = trpc.jobs.tailoredDocuments.useQuery({ jobId: job.id });
  const { generate, isGenerating, generatingKinds } = useGenerateTailoredDocuments(job.id);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [activeKind, setActiveKind] = useState<TailoredDocumentKind>("resume");
  const noDescriptionReason = job.description ? undefined : "This job has no description";

  function openEditor(kind: TailoredDocumentKind) {
    setActiveKind(kind);
    setSheetOpen(true);
  }

  async function handleGenerate(kind: TailoredDocumentKind) {
    if (await generate([kind])) openEditor(kind);
  }

  return (
    <div className="flex flex-col gap-2 border-t pt-4">
      <h3 className="font-medium text-sm">Tailored documents</h3>

      <p className="text-muted-foreground text-sm">
        Generate a resume or cover letter tailored to this job. Download them to apply yourself, or
        the agent will use them when it applies for you.
      </p>
      {/* Row names are static; only the status line and actions wait for the data */}
      <ul className="flex flex-col divide-y rounded-lg border" aria-busy={isLoading}>
        {TAILORED_DOCUMENT_KINDS.map((kind) => {
          const document = tailoredDocumentFor(documents, kind);
          const label = TAILORED_DOCUMENT_LABELS[kind];
          const isPending = generatingKinds.includes(kind);
          return (
            <li key={kind} className="flex items-center gap-3 px-3 py-2">
              {/* Muted until a document exists, so present documents stand out at a glance */}
              <RiFileTextLine
                className={cn(
                  "size-4 shrink-0",
                  document && !isLoading ? "text-foreground" : "text-muted-foreground"
                )}
              />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm">{label}</span>
                {isLoading ? (
                  <Skeleton className="my-0.5 h-3 w-32" />
                ) : (
                  <span className="text-muted-foreground text-xs">
                    {isPending
                      ? "Generating… (up to 30s)"
                      : document
                        ? `Updated ${formatDistanceToNow(document.updatedAt, { addSuffix: true })}`
                        : "Not generated yet"}
                  </span>
                )}
              </div>
              {isLoading ? (
                <Skeleton className="h-7 w-20" />
              ) : document ? (
                <>
                  <Button size="sm" variant="outline" onClick={() => openEditor(kind)}>
                    Open
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Download ${label.toLowerCase()} PDF`}
                    nativeButton={false}
                    render={(props) => (
                      <a
                        {...props}
                        href={tailoredDocumentUrl(job.id, document, { download: true })}
                        download
                      />
                    )}
                  >
                    <RiDownload2Line />
                  </Button>
                  <DeleteTailoredDocumentButton
                    jobId={job.id}
                    kind={kind}
                    iconOnly
                    disabled={isPending}
                  />
                </>
              ) : (
                <GenerateButton
                  disabledReason={noDescriptionReason}
                  disabled={isGenerating}
                  isPending={isPending}
                  onGenerate={() => handleGenerate(kind)}
                />
              )}
            </li>
          );
        })}
      </ul>

      <TailoredDocumentsSheet
        job={job}
        documents={documents}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        activeKind={activeKind}
        onActiveKindChange={setActiveKind}
      />
    </div>
  );
}

function GenerateButton({
  disabledReason,
  disabled,
  isPending,
  onGenerate,
}: {
  disabledReason?: string;
  disabled: boolean;
  isPending: boolean;
  onGenerate: () => void;
}) {
  const button = (
    <Button
      // Keeps the disabled button hoverable/focusable so its tooltip can open.
      focusableWhenDisabled
      variant="outline"
      size="sm"
      className="w-fit aria-disabled:opacity-50"
      disabled={disabledReason !== undefined || disabled}
      onClick={onGenerate}
    >
      {isPending ? (
        <Spinner data-icon="inline-start" />
      ) : (
        <RiSparklingLine data-icon="inline-start" />
      )}
      {isPending ? "Generating…" : "Generate"}
    </Button>
  );

  if (disabledReason === undefined) return button;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger render={button} />
        <TooltipContent>{disabledReason}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
