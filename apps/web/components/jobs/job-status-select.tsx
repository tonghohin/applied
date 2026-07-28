"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Job, JobStatus } from "@/lib/trpc";
import { trpc } from "@/lib/trpc";
import { toTitleCase } from "@repo/shared";
import type { ReactElement } from "react";
import { toast } from "sonner";
import { StatusIcon } from "./job-status-icon";

export const SELECTABLE_STATUSES: JobStatus[] = [
  "pending_review",
  "applied",
  "rejected",
  "skipped",
];

export function JobStatusSelect({
  job,
  selectedJobIds,
  trigger,
}: {
  job: Job;
  selectedJobIds?: string[];
  trigger: ReactElement;
}) {
  const utils = trpc.useUtils();
  const updateMutation = trpc.jobs.updateStatus.useMutation({
    onMutate: async ({ jobId, status }) => {
      await utils.jobs.list.cancel();
      const previousJobs = utils.jobs.list.getData();
      utils.jobs.list.setData(undefined, (jobs) =>
        jobs?.map((existing) => (existing.id === jobId ? { ...existing, status } : existing))
      );
      return { previousJobs };
    },
    onError: (error, _variables, context) => {
      if (context?.previousJobs) {
        utils.jobs.list.setData(undefined, context.previousJobs);
      }
      toast.error(error instanceof Error ? error.message : "Failed to update status");
    },
    onSettled: () => {
      utils.jobs.list.invalidate();
    },
  });

  if (job.status === "applying") {
    return trigger;
  }

  function handleValueChange(status: JobStatus) {
    if (status === job.status) return;

    const newStatus = status;

    if (selectedJobIds?.includes(job.id) && selectedJobIds.length > 1) {
      for (const jobId of selectedJobIds) {
        updateMutation.mutate({ jobId, status: newStatus });
      }
    } else {
      updateMutation.mutate({ jobId: job.id, status: newStatus });
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={trigger}
        disabled={updateMutation.isPending}
        aria-label="Change status"
      />
      <DropdownMenuContent align="start" className="w-fit">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Status</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={job.status} onValueChange={handleValueChange}>
            {SELECTABLE_STATUSES.map((status) => (
              <DropdownMenuRadioItem key={status} value={status}>
                <StatusIcon status={status} />
                {toTitleCase(status)}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
