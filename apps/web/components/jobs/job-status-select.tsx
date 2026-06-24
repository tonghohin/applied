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
import type { Row, Table } from "@tanstack/react-table";
import { JobStatusBadge, STATUS_ICON } from "./job-status-badge";

const SELECTABLE_STATUSES: JobStatus[] = ["pending_review", "applied", "rejected", "skipped"];

export function JobStatusSelect({
  job,
  row,
  table,
}: {
  job: Job;
  row: Row<Job>;
  table: Table<Job>;
}) {
  const utils = trpc.useUtils();
  const updateMutation = trpc.jobs.updateStatus.useMutation();

  if (job.status === "applying") {
    return <JobStatusBadge status={job.status} />;
  }

  async function handleValueChange(status: JobStatus) {
    if (status === job.status) return;

    const newStatus = status;
    const selectedRows = table.getSelectedRowModel().rows;
    const isCurrentRowSelected = row.getIsSelected();

    if (isCurrentRowSelected && selectedRows.length > 1) {
      await Promise.all(
        selectedRows.map((selectedRow) =>
          updateMutation.mutateAsync({ jobId: selectedRow.original.id, status: newStatus })
        )
      );
    } else {
      await updateMutation.mutateAsync({ jobId: job.id, status: newStatus });
    }

    utils.jobs.list.invalidate();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<JobStatusBadge status={job.status} className="cursor-pointer" />}
        nativeButton={false}
        disabled={updateMutation.isPending}
        aria-label="Change status"
      />
      <DropdownMenuContent align="start" className="w-fit">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Status</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={job.status} onValueChange={handleValueChange}>
            {SELECTABLE_STATUSES.map((status) => {
              const Icon = STATUS_ICON[status];
              return (
                <DropdownMenuRadioItem key={status} value={status}>
                  <Icon />
                  {toTitleCase(status)}
                </DropdownMenuRadioItem>
              );
            })}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
