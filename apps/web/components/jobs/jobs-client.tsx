"use client";

import { JobListSkeleton } from "@/components/jobs/job-list-skeleton";
import { JobsDataTable } from "@/components/jobs/jobs-data-table";
import { PageLayout } from "@/components/page-layout";
import { SearchJobsButton } from "@/components/search-jobs-button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { trpc } from "@/lib/trpc";
import type { RouterOutputs } from "@repo/api";
import { RiBriefcaseLine } from "@remixicon/react";

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
        <Empty className="min-h-80 border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <RiBriefcaseLine />
            </EmptyMedia>
            <EmptyContent>
              <EmptyTitle>No jobs yet</EmptyTitle>
              <EmptyDescription>Search LinkedIn for positions matching your profile.</EmptyDescription>
            </EmptyContent>
            <SearchJobsButton />
          </EmptyHeader>
        </Empty>
      ) : (
        <JobsDataTable jobs={jobs} />
      )}
    </PageLayout>
  );
}
