"use client";

import { EmptyState } from "@/components/jobs/empty-state";
import { JobListSkeleton } from "@/components/jobs/job-list-skeleton";
import { JobsDataTable } from "@/components/jobs/jobs-data-table";
import { PageLayout } from "@/components/page-layout";
import { SearchJobsButton } from "@/components/search-jobs-button";
import { trpc } from "@/lib/trpc";
import type { RouterOutputs } from "@repo/api";

type InitialJobs = RouterOutputs["jobs"]["list"];

export function JobsClient({ initialJobs }: { initialJobs: InitialJobs }) {
  const { data: jobs = [], isLoading } = trpc.jobs.list.useQuery(undefined, {
    initialData: initialJobs,
  });

  return (
    <PageLayout title="Jobs" action={<SearchJobsButton />}>
      {isLoading ? (
        <JobListSkeleton />
      ) : jobs.length === 0 ? (
        <EmptyState
          title="No jobs yet"
          description="Click Search jobs to find matching positions."
        />
      ) : (
        <JobsDataTable jobs={jobs} />
      )}
    </PageLayout>
  );
}
