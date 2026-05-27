"use client";

import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { Job } from "@/lib/trpc";
import { trpc } from "@/lib/trpc";
import { format } from "date-fns";

const FIT_TIER_VARIANT: Record<Job["fitTier"], BadgeVariant> = {
  strong: "default",
  potential: "warning",
  weak: "secondary",
};

type ApplyRun = NonNullable<Job["latestApplyRun"]>;

function ApplyRunLog({ applyRun }: { applyRun: ApplyRun }) {
  return (
    <details className="text-xs">
      <summary className="cursor-pointer select-none text-muted-foreground hover:text-foreground">
        View apply log ({applyRun.logs.length} steps)
      </summary>
      <div className="mt-2 space-y-1 rounded-md bg-muted/50 p-3 font-mono">
        {applyRun.errorMessage && (
          <p className="mb-2 text-destructive">Error: {applyRun.errorMessage}</p>
        )}
        {applyRun.logs.map((entry, i) => (
          <div key={`${i}:${entry.timestamp}`} className="flex gap-3">
            <span className="shrink-0 text-muted-foreground/60">
              {format(new Date(entry.timestamp), "h:mm:ss a")}
            </span>
            <span className="text-foreground">{entry.message}</span>
          </div>
        ))}
        {applyRun.logs.length === 0 && (
          <p className="text-muted-foreground italic">No log entries recorded.</p>
        )}
      </div>
    </details>
  );
}

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

  const showLog =
    job.latestApplyRun !== null && (job.status === "applied" || job.status === "failed");

  return (
    <div
      className={`flex flex-col gap-3 rounded-lg border p-4 ${selected ? "border-primary bg-primary/5" : ""}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <a
              href={job.url}
              target="_blank"
              rel="noopener noreferrer"
              className="truncate font-medium hover:underline"
            >
              {job.title}
            </a>
            <Badge variant={FIT_TIER_VARIANT[job.fitTier]}>{job.fitTier}</Badge>
          </div>
          <p className="text-muted-foreground text-sm">
            {job.company}
            {job.location ? ` · ${job.location}` : ""}
          </p>
        </div>
        {(job.status === "pending_review" || job.status === "failed") && onToggleSelect && (
          <Checkbox
            checked={selected ?? false}
            onCheckedChange={onToggleSelect}
            className="shrink-0"
          />
        )}
        {job.status === "pending_review" && (
          <div className="flex shrink-0 items-center gap-2">
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

      {showLog && job.latestApplyRun && <ApplyRunLog applyRun={job.latestApplyRun} />}
    </div>
  );
}
