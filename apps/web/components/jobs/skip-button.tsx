"use client";

import { Button } from "@/components/ui/button";
import type { Job } from "@/lib/trpc";
import { trpc } from "@/lib/trpc";
import type { Table } from "@tanstack/react-table";

export function SkipButton({ jobId, table }: { jobId: string; table: Table<Job> }) {
  const utils = trpc.useUtils();
  const skipMutation = trpc.jobs.updateStatus.useMutation();

  async function handleSkip() {
    const selectedIds = table.getSelectedRowModel().rows.map((row) => row.original.id);
    const idsToSkip = selectedIds.includes(jobId) ? selectedIds : [jobId];
    await Promise.all(
      idsToSkip.map((id) => skipMutation.mutateAsync({ jobId: id, status: "skipped" }))
    );
    table.resetRowSelection();
    utils.jobs.list.invalidate();
  }

  return (
    <Button size="xs" variant="outline" disabled={skipMutation.isPending} onClick={handleSkip}>
      Skip
    </Button>
  );
}
