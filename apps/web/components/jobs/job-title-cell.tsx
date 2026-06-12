"use client";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
} from "@/components/ui/popover";
import { useTextSelection } from "@/hooks/use-text-selection";
import type { Job } from "@/lib/trpc";
import { trpc } from "@/lib/trpc";
import { RiExternalLinkLine } from "@remixicon/react";
import Link from "next/link";
import { useRef } from "react";
import { toast } from "sonner";

export function JobTitleCell({ job }: { job: Job }) {
  const cellRef = useRef<HTMLSpanElement>(null);
  const { selection, clearSelection } = useTextSelection(cellRef, {
    minLength: 2,
    maxLength: 50,
  });
  const utils = trpc.useUtils();
  const excludeMutation = trpc.jobs.excludeKeyword.useMutation();

  async function handleExclude() {
    if (!selection) return;
    try {
      const result = await excludeMutation.mutateAsync({ keyword: selection.text });
      utils.jobs.list.invalidate();
      toast.success(
        result.alreadyExcluded
          ? `"${result.keyword}" was already excluded — skipped ${result.skippedCount} matching job(s)`
          : `Excluded "${result.keyword}" — skipped ${result.skippedCount} matching job(s)`
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to exclude keyword");
    } finally {
      clearSelection();
    }
  }

  return (
    <span className="flex max-w-70 flex-col gap-0.5">
      <span className="flex items-center justify-between gap-1.5">
        <span ref={cellRef} className="whitespace-normal font-medium">
          {job.title}
        </span>
        <Link
          href={job.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open job posting"
          className="shrink-0 text-muted-foreground hover:text-foreground"
        >
          <RiExternalLinkLine className="size-3.5" />
        </Link>
      </span>
      <span
        className="truncate text-muted-foreground text-xs"
        title={`${job.company} · ${job.location}`}
      >
        {job.company} · {job.location}
      </span>
      {selection && (
        <Popover
          open
          onOpenChange={(open) => {
            if (!open) clearSelection();
          }}
        >
          <PopoverContent
            anchor={{ getBoundingClientRect: () => selection.rect }}
            initialFocus={false}
          >
            <PopoverHeader>
              <PopoverTitle>Exclude {selection.text}</PopoverTitle>
              <PopoverDescription>
                Adds it to your excluded keywords: future searches skip matching titles, and
                matching jobs already in your list are marked as skipped.
              </PopoverDescription>
            </PopoverHeader>
            <Button
              size="xs"
              variant="outline"
              disabled={excludeMutation.isPending}
              onClick={handleExclude}
            >
              {excludeMutation.isPending ? "Excluding…" : "Exclude"}
            </Button>
          </PopoverContent>
        </Popover>
      )}
    </span>
  );
}
