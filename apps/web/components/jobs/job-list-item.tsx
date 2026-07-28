"use client";

import { ScoreRing } from "@/components/jobs/job-score";
import { StatusIcon } from "@/components/jobs/job-status-icon";
import { JobStatusSelect } from "@/components/jobs/job-status-select";
import { Checkbox } from "@/components/ui/checkbox";
import { formatAppliedBeforeText } from "@/lib/applied-before";
import type { Job } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { capitalize, toTitleCase } from "@repo/shared";
import { formatDistanceToNow } from "date-fns";

export function JobListItem({
  job,
  selected,
  onSelect,
  checked,
  onCheckedChange,
  selectedJobIds,
}: {
  job: Job;
  selected: boolean;
  onSelect: () => void;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  selectedJobIds: string[];
}) {
  const appliedBeforeText = formatAppliedBeforeText(job.appliedCountAtCompany);

  return (
    <li className={cn("flex items-start gap-2 px-4 py-3 hover:bg-muted", selected && "bg-muted")}>
      <Checkbox
        className="mt-0.5"
        checked={checked}
        onCheckedChange={(value) => onCheckedChange(!!value)}
        aria-label={`Select ${job.title}`}
      />
      <div className="flex flex-1 flex-col">
        <button
          type="button"
          onClick={onSelect}
          aria-current={selected}
          className="flex flex-col text-left"
        >
          <span className="flex items-start justify-between gap-2">
            <span className="font-medium text-sm">{job.title}</span>
            <ScoreRing score={job.score} />
          </span>
          <span className="text-xs">{job.company}</span>
          <span className="text-muted-foreground text-xs">
            {job.location} · {toTitleCase(job.workplaceType)}
          </span>
        </button>
        <span className="flex items-center gap-2 text-xs">
          <JobStatusSelect
            job={job}
            selectedJobIds={selectedJobIds}
            trigger={
              <button type="button" className="inline-flex cursor-pointer">
                <StatusIcon status={job.status} className="size-3.5" />
              </button>
            }
          />
          <span className="text-muted-foreground">
            {capitalize(
              formatDistanceToNow(job.status === "pending_review" ? job.createdAt : job.updatedAt, {
                addSuffix: true,
              })
            )}
          </span>
          {appliedBeforeText && (
            <span className="ml-auto text-muted-foreground">{appliedBeforeText}</span>
          )}
        </span>
      </div>
    </li>
  );
}
