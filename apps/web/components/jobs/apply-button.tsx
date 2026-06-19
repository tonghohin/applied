"use client";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Job } from "@/lib/trpc";
import { trpc } from "@/lib/trpc";
import { RiSendPlaneLine } from "@remixicon/react";
import type { Table } from "@tanstack/react-table";

export function ApplyButton({ jobId, table }: { jobId: string; table: Table<Job> }) {
  const utils = trpc.useUtils();
  const applyMutation = trpc.jobs.applyJobs.useMutation();

  async function handleApply() {
    const selectedIds = table.getSelectedRowModel().rows.map((row) => row.original.id);
    const jobIds = selectedIds.includes(jobId) ? selectedIds : [jobId];
    await applyMutation.mutateAsync({ jobIds });
    table.resetRowSelection();
    utils.jobs.list.invalidate();
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            size="icon-sm"
            disabled={applyMutation.isPending}
            onClick={handleApply}
            aria-label="Apply"
          />
        }
      >
        <RiSendPlaneLine />
      </TooltipTrigger>
      <TooltipContent>Apply</TooltipContent>
    </Tooltip>
  );
}
