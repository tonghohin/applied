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
import { useEffect, useRef, useState } from "react";

type InitialJobs = RouterOutputs["jobs"]["list"];

function writeJobIdParam(pathname: string, jobId: string | null) {
  const params = new URLSearchParams(window.location.search);
  if (jobId) {
    params.set("jobId", jobId);
  } else {
    params.delete("jobId");
  }
  const query = params.toString();
  window.history.replaceState(null, "", query ? `${pathname}?${query}` : pathname);
}

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

  const filteredSortedJobs = filterAndSortJobs(jobs, {
    statuses: statusFilter,
    workplaceTypes: workplaceFilter,
    search,
    sortBy,
  });

  function selectJob(jobId: string | null) {
    setSelectedJobId(jobId);
    writeJobIdParam(pathname, jobId);
  }

  // Select the first visible job whenever the user changes a filter, and on
  // first load unless the URL already points at a real job (that one just shows
  // in the detail pane). Job data changing under the same filter (SSE) is left
  // alone.
  const lastFilterKey = useRef<string | null>(null);
  const filterKey = JSON.stringify([statusFilter, workplaceFilter, search, sortBy]);
  useEffect(() => {
    if (jobs.length === 0 || lastFilterKey.current === filterKey) return;
    const isFirstRun = lastFilterKey.current === null;
    lastFilterKey.current = filterKey;
    if (isFirstRun && selectedJobId !== null && jobs.some((job) => job.id === selectedJobId)) {
      return;
    }
    const nextId = filteredSortedJobs[0]?.id ?? null;
    setSelectedJobId(nextId);
    writeJobIdParam(pathname, nextId);
  }, [jobs, filteredSortedJobs, selectedJobId, filterKey, pathname]);

  const selectedJob = jobs.find((job) => job.id === selectedJobId) ?? null;

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
