"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { JobCard } from "./job-card";
import { trpc } from "@/lib/trpc";
import { jobStatusEnum } from "@repo/db";
import type { Job } from "@repo/db";

const TAB_LABELS: Record<(typeof jobStatusEnum.enumValues)[number], string> = {
  pending_review: "Pending",
  applied: "Applied",
  failed: "Failed",
  skipped: "Skipped",
};

const TABS = jobStatusEnum.enumValues.map((value) => ({
  value,
  label: TAB_LABELS[value],
}));

interface JobTabsProps {
  jobs: Job[];
}

export function JobTabs({ jobs }: JobTabsProps) {
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

  const pendingJobs = jobs.filter((j) => j.status === "pending_review");

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

      <TabsContent value="pending_review" className="mt-4">
        {selectedIds.size > 0 && (
          <div className="flex justify-end mb-3">
            <Button
              size="sm"
              disabled={applyMutation.isPending}
              onClick={() => applyMutation.mutate({ jobIds: Array.from(selectedIds) })}
            >
              {applyMutation.isPending
                ? "Applying…"
                : `Apply to Selected (${selectedIds.size})`}
            </Button>
          </div>
        )}
        <div className="flex flex-col gap-3">
          {pendingJobs.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              selected={selectedIds.has(job.id)}
              onToggleSelect={() => toggleSelect(job.id)}
            />
          ))}
          {pendingJobs.length === 0 && (
            <p className="text-sm text-muted-foreground py-8 text-center">No jobs here yet.</p>
          )}
        </div>
      </TabsContent>

      {TABS.filter((t) => t.value !== "pending_review").map((tab) => (
        <TabsContent key={tab.value} value={tab.value} className="mt-4">
          <div className="flex flex-col gap-3">
            {jobs.filter((j) => j.status === tab.value).map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
            {jobs.filter((j) => j.status === tab.value).length === 0 && (
              <p className="text-sm text-muted-foreground py-8 text-center">No jobs here yet.</p>
            )}
          </div>
        </TabsContent>
      ))}
    </Tabs>
  );
}
