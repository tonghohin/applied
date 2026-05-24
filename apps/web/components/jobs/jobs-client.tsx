"use client";

import { EmptyState } from "@/components/jobs/empty-state";
import { JobListSkeleton } from "@/components/jobs/job-list-skeleton";
import { JobTabs } from "@/components/jobs/job-tabs";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

export function JobsClient() {
  const { data: jobs = [], isLoading } = trpc.jobs.list.useQuery(undefined, {
    refetchInterval: (query) => {
      const data = query.state.data ?? [];
      const hasInFlight = data.some((j) => j.status === "pending_review");
      return hasInFlight ? 3000 : false;
    },
  });
  const searchMutation = trpc.jobs.search.useMutation();

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Jobs</h1>
        <Button onClick={() => searchMutation.mutate()} disabled={searchMutation.isPending}>
          {searchMutation.isPending ? "Searching…" : "Search Jobs"}
        </Button>
      </div>
      {isLoading ? (
        <JobListSkeleton />
      ) : jobs.length === 0 ? (
        <EmptyState
          title="No jobs yet"
          description="Click Search Jobs to find matching positions."
        />
      ) : (
        <JobTabs jobs={jobs} />
      )}
    </>
  );
}
