"use client";

import { JobListSkeleton } from "@/components/jobs/job-list-skeleton";
import { JobsSplitView } from "@/components/jobs/jobs-split-view";
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
import { DEFAULT_VISIBLE_STATUSES, type JobSortBy, filterAndSortJobs } from "@/lib/jobs-filter";
import type { JobStatus } from "@/lib/trpc";
import { trpc } from "@/lib/trpc";
import { RiBriefcaseLine } from "@remixicon/react";
import type { RouterOutputs } from "@repo/api";
import type { WorkType } from "@repo/shared";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

type InitialJobs = RouterOutputs["jobs"]["list"];

export function JobsClient({ initialJobs }: { initialJobs: InitialJobs }) {
  const { data: jobs = [], isLoading } = trpc.jobs.list.useQuery(undefined, {
    initialData: initialJobs,
  });

  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [selectedJobId, setSelectedJobId] = useState<string | null>(() =>
    searchParams.get("jobId")
  );

  const [statusFilter, setStatusFilter] = useState<JobStatus[]>(DEFAULT_VISIBLE_STATUSES);
  const [workplaceFilter, setWorkplaceFilter] = useState<WorkType[]>([]);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<JobSortBy>("score-desc");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const filteredSortedJobs = useMemo(
    () =>
      filterAndSortJobs(jobs, {
        statuses: statusFilter,
        workplaceTypes: workplaceFilter,
        search,
        sortBy,
      }),
    [jobs, statusFilter, workplaceFilter, search, sortBy]
  );

  const selectJob = useCallback(
    (jobId: string) => {
      setSelectedJobId(jobId);
      const params = new URLSearchParams(window.location.search);
      params.set("jobId", jobId);
      window.history.replaceState(null, "", `${pathname}?${params.toString()}`);
    },
    [pathname]
  );

  useEffect(() => {
    if (filteredSortedJobs.length === 0) return;
    if (filteredSortedJobs.some((job) => job.id === selectedJobId)) return;
    selectJob(filteredSortedJobs[0].id);
  }, [filteredSortedJobs, selectedJobId, selectJob]);

  const selectedJob = filteredSortedJobs.find((job) => job.id === selectedJobId) ?? null;

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
              <EmptyDescription>
                Search LinkedIn for positions matching your profile.
              </EmptyDescription>
            </EmptyContent>
            <SearchJobsButton />
          </EmptyHeader>
        </Empty>
      ) : (
        <JobsSplitView
          jobs={filteredSortedJobs}
          selectedJob={selectedJob}
          onSelectJob={selectJob}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          workplaceFilter={workplaceFilter}
          onWorkplaceFilterChange={setWorkplaceFilter}
          search={search}
          onSearchChange={setSearch}
          sortBy={sortBy}
          onSortByChange={setSortBy}
          selectedIds={selectedIds}
          onSelectedIdsChange={setSelectedIds}
        />
      )}
    </PageLayout>
  );
}
