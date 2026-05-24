"use client";

import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import type { Job } from "@/lib/trpc";

const FIT_TIER_STYLES: Record<Job["fitTier"], string> = {
  strong: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  potential: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  weak: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
};

interface JobCardProps {
  job: Job;
  selected?: boolean;
  onToggleSelect?: () => void;
}

export function JobCard({ job, selected, onToggleSelect }: JobCardProps) {
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
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${FIT_TIER_STYLES[job.fitTier]}`}
          >
            {job.fitTier}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          {job.company}
          {job.location ? ` · ${job.location}` : ""}
        </p>
      </div>
      {job.status === "pending_review" && (
        <div className="flex items-center gap-2 shrink-0">
          {onToggleSelect && (
            <input
              type="checkbox"
              checked={selected ?? false}
              onChange={onToggleSelect}
              className="h-4 w-4 cursor-pointer"
            />
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
