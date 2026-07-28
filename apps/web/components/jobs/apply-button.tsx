"use client";

import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { RiSendPlaneLine } from "@remixicon/react";

export function ApplyButton({ jobId }: { jobId: string }) {
  const utils = trpc.useUtils();
  const applyMutation = trpc.jobs.applyJobs.useMutation();

  async function handleApply() {
    await applyMutation.mutateAsync({ jobIds: [jobId] });
    utils.jobs.list.invalidate();
  }

  return (
    <Button className="w-fit" disabled={applyMutation.isPending} onClick={handleApply}>
      <RiSendPlaneLine data-icon="inline-start" />
      Apply now
    </Button>
  );
}
