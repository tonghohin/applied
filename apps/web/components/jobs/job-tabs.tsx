"use client";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import type { Job, JobStatus } from "@/lib/trpc";
import { useState } from "react";
import { JobCard } from "./job-card";

const JOB_STATUSES = ["pending_review", "applied", "failed", "skipped"] satisfies JobStatus[];

const TAB_LABELS: Record<JobStatus, string> = {
  pending_review: "Pending",
  applied: "Applied",
  failed: "Failed",
  skipped: "Skipped",
};

const TABS = JOB_STATUSES.map((value) => ({
  value,
  label: TAB_LABELS[value],
}));

const SELECTABLE_STATUSES = new Set<JobStatus>(["pending_review", "failed"]);

export function JobTabs({
  jobs,
}: {
  jobs: Job[];
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const utils = trpc.useUtils();
  const applyMutation = trpc.jobs.applyJobs.useMutation({
    onSuccess: () => {
      setSelectedIds(new Set());
      utils.jobs.list.invalidate();
    },
  });

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <Tabs defaultValue="pending_review">
      <TabsList>
        {TABS.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value}>
            {tab.label}
            <span className="ml-1.5 text-xs opacity-60">
              ({jobs.filter((j) => j.status === tab.value).length})
            </span>
          </TabsTrigger>
        ))}
      </TabsList>

      {TABS.map((tab) => {
        const tabJobs = jobs.filter((j) => j.status === tab.value);
        const selectable = SELECTABLE_STATUSES.has(tab.value);
        const tabSelected = tabJobs.filter((j) => selectedIds.has(j.id));

        return (
          <TabsContent key={tab.value} value={tab.value} className="mt-4">
            {selectable && tabSelected.length > 0 && (
              <div className="mb-3 flex justify-end">
                <Button
                  size="sm"
                  disabled={applyMutation.isPending}
                  onClick={() => applyMutation.mutate({ jobIds: tabSelected.map((j) => j.id) })}
                >
                  {applyMutation.isPending
                    ? "Applying…"
                    : `Apply to Selected (${tabSelected.length})`}
                </Button>
              </div>
            )}
            <div className="flex flex-col gap-3">
              {tabJobs.map((job) => (
                <JobCard
                  key={job.id}
                  job={job}
                  selected={selectedIds.has(job.id)}
                  onToggleSelect={selectable ? () => toggleSelect(job.id) : undefined}
                />
              ))}
              {tabJobs.length === 0 && (
                <p className="py-8 text-center text-muted-foreground text-sm">No jobs here yet.</p>
              )}
            </div>
          </TabsContent>
        );
      })}
    </Tabs>
  );
}
