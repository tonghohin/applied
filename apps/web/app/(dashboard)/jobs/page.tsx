"use client";

import { Button } from "@/components/ui/button";
import { JobTabs } from "@/components/jobs/job-tabs";
import { trpc } from "@/lib/trpc";

export default function JobsPage() {
  const { data: jobs = [], isLoading } = trpc.jobs.list.useQuery();
  const searchMutation = trpc.jobs.search.useMutation();

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Jobs</h1>
        <Button
          onClick={() => searchMutation.mutate()}
          disabled={searchMutation.isPending}
        >
          {searchMutation.isPending ? "Searching…" : "Search Jobs"}
        </Button>
      </div>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <JobTabs jobs={jobs} />
      )}
    </div>
  );
}
