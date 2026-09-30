"use client";

import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { RiSendPlaneLine } from "@remixicon/react";
import { toast } from "sonner";

export function ApplyButton({ jobId }: { jobId: string }) {
  const utils = trpc.useUtils();
  const applyMutation = trpc.jobs.applyJobs.useMutation();

  async function handleApply() {
    try {
      await applyMutation.mutateAsync({ jobIds: [jobId] });
      utils.jobs.list.invalidate();
    } catch (err) {
      toast.error("Couldn't start application", {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  }

  return (
    <Button className="w-fit" disabled={applyMutation.isPending} onClick={handleApply}>
      <RiSendPlaneLine data-icon="inline-start" />
      Apply now
    </Button>
  );
}
