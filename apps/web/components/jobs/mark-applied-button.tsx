"use client";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Job } from "@/lib/trpc";
import { trpc } from "@/lib/trpc";
import { RiCheckLine } from "@remixicon/react";
import type { Table } from "@tanstack/react-table";

export function MarkAppliedButton({ jobId, table }: { jobId: string; table: Table<Job> }) {
  const utils = trpc.useUtils();
  const markAppliedMutation = trpc.jobs.updateStatus.useMutation();

  async function handleMarkApplied() {
    const selectedIds = table.getSelectedRowModel().rows.map((row) => row.original.id);
    const idsToMark = selectedIds.includes(jobId) ? selectedIds : [jobId];
    await Promise.all(
      idsToMark.map((id) => markAppliedMutation.mutateAsync({ jobId: id, status: "applied" }))
    );
    table.resetRowSelection();
    utils.jobs.list.invalidate();
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            size="icon-sm"
            variant="outline"
            disabled={markAppliedMutation.isPending}
            onClick={handleMarkApplied}
            aria-label="Mark as applied"
          />
        }
      >
        <RiCheckLine />
      </TooltipTrigger>
      <TooltipContent>Mark as applied</TooltipContent>
    </Tooltip>
  );
}
