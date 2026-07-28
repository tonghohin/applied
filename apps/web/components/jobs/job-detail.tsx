"use client";

import { ApplyButton } from "@/components/jobs/apply-button";
import { ApplyRunLog } from "@/components/jobs/apply-run-log";
import { StatusIcon } from "@/components/jobs/job-status-icon";
import { JobStatusSelect } from "@/components/jobs/job-status-select";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useTextSelection } from "@/hooks/use-text-selection";
import type { Job, JobStatus } from "@/lib/trpc";
import { trpc } from "@/lib/trpc";
import { RiExternalLinkLine } from "@remixicon/react";
import { toTitleCase } from "@repo/shared";
import Link from "next/link";
import { useRef, useState } from "react";
import { toast } from "sonner";

const ACTIONABLE_STATUSES: JobStatus[] = ["pending_review", "failed"];

export function JobDetail({ job }: { job: Job }) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const { selection, clearSelection } = useTextSelection(titleRef, {
    minLength: 2,
    maxLength: 50,
  });
  const utils = trpc.useUtils();
  const excludeMutation = trpc.jobs.excludeKeyword.useMutation();
  const excludeCompanyMutation = trpc.jobs.excludeCompany.useMutation();
  const skipMutation = trpc.jobs.updateStatus.useMutation();
  const [companyPopoverOpen, setCompanyPopoverOpen] = useState(false);

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

  async function handleSkip() {
    await skipMutation.mutateAsync({ jobId: job.id, status: "skipped" });
    utils.jobs.list.invalidate();
  }

  const isActionable = ACTIONABLE_STATUSES.includes(job.status);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <span className="flex items-center gap-1.5">
          <h2 ref={titleRef} className="whitespace-normal font-semibold text-xl">
            {job.title}
          </h2>
          <Link
            href={job.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open job posting"
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            <RiExternalLinkLine className="size-4" />
          </Link>
        </span>

        <Popover open={companyPopoverOpen} onOpenChange={setCompanyPopoverOpen}>
          <PopoverTrigger
            className="w-fit cursor-pointer underline-offset-2 hover:text-foreground hover:underline"
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
        </Popover>
        <div className="flex items-center gap-2">
          <p className="text-muted-foreground text-sm">
            {job.location} · {toTitleCase(job.workplaceType)}
          </p>
          <JobStatusSelect
            job={job}
            trigger={
              <button type="button" className="inline-flex cursor-pointer">
                <StatusIcon status={job.status} className="size-3.5" />
              </button>
            }
          />
        </div>

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
      </div>

      {isActionable && <ApplyButton jobId={job.id} />}

      <div className="border-t pt-4">
        {job.description ? (
          <p className="wrap-break-word whitespace-pre-wrap text-sm">{job.description}</p>
        ) : (
          <p className="text-muted-foreground text-sm">No description available</p>
        )}
      </div>

      {job.latestApplyRun && (
        <div className="flex flex-col gap-2 border-t pt-4">
          <h3 className="font-medium text-sm">Apply logs</h3>
          <ApplyRunLog applyRun={job.latestApplyRun} />
        </div>
      )}
    </div>
  );
}
