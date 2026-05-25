"use client";

import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { trpc } from "@/lib/trpc";
import type { Job } from "@/lib/trpc";

const FIT_TIER_VARIANT: Record<Job["fitTier"], BadgeVariant> = {
  strong: "success",
  potential: "warning",
  weak: "muted",
};

export function JobCard({
  job,
  selected,
  onToggleSelect,
}: {
  job: Job;
  selected?: boolean;
  onToggleSelect?: () => void;
}) {
  const utils = trpc.useUtils();
  const updateStatus = trpc.jobs.updateStatus.useMutation({
    onSuccess: () => utils.jobs.list.invalidate(),
  });

  return (
    <div
      className={`rounded-lg border p-4 flex items-start justify-between gap-4 ${selected ? "border-primary bg-primary/5" : ""}`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <a
            href={job.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium hover:underline truncate"
          >
            {job.title}
          </a>
          <Badge variant={FIT_TIER_VARIANT[job.fitTier]}>{job.fitTier}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {job.company}
          {job.location ? ` · ${job.location}` : ""}
        </p>
      </div>
      {job.status === "pending_review" && (
        <div className="flex items-center gap-2 shrink-0">
          {onToggleSelect && (
            <Checkbox checked={selected ?? false} onCheckedChange={onToggleSelect} />
          )}
          <Button
            size="sm"
            variant="outline"
            disabled={updateStatus.isPending}
            onClick={() => updateStatus.mutate({ jobId: job.id, status: "skipped" })}
          >
            Skip
          </Button>
        </div>
      )}
    </div>
  );
}
