"use client";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { useGenerateTailoredDocuments } from "@/hooks/use-generate-tailored-documents";
import { TAILORED_DOCUMENT_LABELS } from "@/lib/tailored-documents";
import { RiRefreshLine } from "@remixicon/react";
import type { TailoredDocumentKind } from "@repo/shared";
import { useState } from "react";

export function RegenerateTailoredDocumentButton({
  jobId,
  kind,
  iconOnly = false,
  disabled = false,
  onRegenerated,
}: {
  jobId: string;
  kind: TailoredDocumentKind;
  iconOnly?: boolean;
  disabled?: boolean;
  onRegenerated?: () => void;
}) {
  const { generate, isGenerating } = useGenerateTailoredDocuments(jobId);
  const [open, setOpen] = useState(false);
  const label = TAILORED_DOCUMENT_LABELS[kind].toLowerCase();
  const isRegenerating = isGenerating(kind);

  async function handleRegenerate() {
    setOpen(false);
    if (await generate([kind])) onRegenerated?.();
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size={iconOnly ? "icon-sm" : "default"}
            aria-label={iconOnly ? `Regenerate ${label}` : undefined}
            disabled={disabled || isRegenerating}
          />
        }
      >
        {isRegenerating ? (
          <Spinner data-icon={iconOnly ? undefined : "inline-start"} />
        ) : (
          <RiRefreshLine data-icon={iconOnly ? undefined : "inline-start"} />
        )}
        {iconOnly ? null : isRegenerating ? "Regenerating…" : "Regenerate"}
      </PopoverTrigger>
      <PopoverContent initialFocus={false}>
        <PopoverHeader>
          <PopoverTitle>Regenerate {label}?</PopoverTitle>
          <PopoverDescription>
            Replaces this {label} with a new version, including any edits you've made.
          </PopoverDescription>
        </PopoverHeader>
        <Button type="button" size="xs" variant="outline" onClick={handleRegenerate}>
          Regenerate
        </Button>
      </PopoverContent>
    </Popover>
  );
}
