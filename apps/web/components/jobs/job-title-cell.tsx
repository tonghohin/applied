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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTextSelection } from "@/hooks/use-text-selection";
import type { Job } from "@/lib/trpc";
import { trpc } from "@/lib/trpc";
import { RiExternalLinkLine } from "@remixicon/react";
import Link from "next/link";
import { useRef, useState } from "react";
import { toast } from "sonner";

export function JobTitleCell({ job }: { job: Job }) {
  const cellRef = useRef<HTMLSpanElement>(null);
  const { selection, clearSelection } = useTextSelection(cellRef, {
    minLength: 2,
    maxLength: 50,
  });
  const utils = trpc.useUtils();
  const excludeMutation = trpc.jobs.excludeKeyword.useMutation();
  const [companyPopoverOpen, setCompanyPopoverOpen] = useState(false);
  const excludeCompanyMutation = trpc.jobs.excludeCompany.useMutation();

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

  async function handleExcludeCompany() {
    try {
      const result = await excludeCompanyMutation.mutateAsync({ company: job.company });
      utils.jobs.list.invalidate();
      toast.success(
        result.alreadyExcluded
          ? `"${result.company}" was already excluded — skipped ${result.skippedCount} matching job(s)`
          : `Excluded "${result.company}" — skipped ${result.skippedCount} matching job(s)`
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to exclude company");
    } finally {
      setCompanyPopoverOpen(false);
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
        <Popover open={companyPopoverOpen} onOpenChange={setCompanyPopoverOpen}>
          <PopoverTrigger
            className="cursor-pointer underline-offset-2 hover:text-foreground hover:underline"
            aria-label={`Exclude jobs from ${job.company}`}
          >
            {job.company}
          </PopoverTrigger>
          <PopoverContent initialFocus={false}>
            <PopoverHeader>
              <PopoverTitle>Exclude {job.company}</PopoverTitle>
              <PopoverDescription>
                Adds it to your excluded companies: future searches skip its jobs, and its jobs
                already in your list are marked as skipped.
              </PopoverDescription>
            </PopoverHeader>
            <Button
              size="xs"
              variant="outline"
              disabled={excludeCompanyMutation.isPending}
              onClick={handleExcludeCompany}
            >
              {excludeCompanyMutation.isPending ? "Excluding…" : "Exclude"}
            </Button>
          </PopoverContent>
        </Popover>{" "}
        · {job.location}{" "}
        {job.appliedCountAtCompany > 0 && (
          <Tooltip>
            <TooltipTrigger className="cursor-default">
              <span className="text-warning"> ({job.appliedCountAtCompany}×)</span>
            </TooltipTrigger>
            <TooltipContent>
              Applied to {job.company} {job.appliedCountAtCompany} time
              {job.appliedCountAtCompany > 1 ? "s" : ""} before
            </TooltipContent>
          </Tooltip>
        )}
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
