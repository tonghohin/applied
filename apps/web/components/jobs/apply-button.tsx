"use client";

import { Button } from "@/components/ui/button";
import type { Job } from "@/lib/trpc";
import { trpc } from "@/lib/trpc";
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
    <Button size="xs" disabled={applyMutation.isPending} onClick={handleApply}>
      Apply
    </Button>
  );
}
