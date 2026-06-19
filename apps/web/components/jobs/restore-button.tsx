"use client";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Job } from "@/lib/trpc";
import { trpc } from "@/lib/trpc";
import { RiHistoryLine } from "@remixicon/react";
import type { Table } from "@tanstack/react-table";

export function RestoreButton({ jobId, table }: { jobId: string; table: Table<Job> }) {
  const utils = trpc.useUtils();
  const restoreMutation = trpc.jobs.updateStatus.useMutation();

  async function handleRestore() {
    const selectedIds = table.getSelectedRowModel().rows.map((row) => row.original.id);
    const idsToRestore = selectedIds.includes(jobId) ? selectedIds : [jobId];
    await Promise.all(
      idsToRestore.map((id) => restoreMutation.mutateAsync({ jobId: id, status: "pending_review" }))
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
            disabled={restoreMutation.isPending}
            onClick={handleRestore}
            aria-label="Restore"
          />
        }
      >
        <RiHistoryLine />
      </TooltipTrigger>
      <TooltipContent>Restore</TooltipContent>
    </Tooltip>
  );
}
