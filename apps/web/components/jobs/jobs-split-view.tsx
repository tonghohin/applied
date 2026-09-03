"use client";

import { JobDetail } from "@/components/jobs/job-detail";
import { JobListItem } from "@/components/jobs/job-list-item";
import { JobsFilterBar } from "@/components/jobs/jobs-filter-bar";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { JobSortBy } from "@/lib/jobs-filter";
import type { Job, JobStatus } from "@/lib/trpc";
import type { WorkType } from "@repo/shared";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useState } from "react";

const ROW_HEIGHT = 92;

export function JobsSplitView({
  jobs,
  selectedJob,
  onSelectJob,
  statusFilter,
  onStatusFilterChange,
  workplaceFilter,
  onWorkplaceFilterChange,
  search,
  onSearchChange,
  sortBy,
  onSortByChange,
  selectedIds,
  onSelectedIdsChange,
}: {
  jobs: Job[];
  selectedJob: Job | null;
  onSelectJob: (jobId: string) => void;
  statusFilter: JobStatus[];
  onStatusFilterChange: (statuses: JobStatus[]) => void;
  workplaceFilter: WorkType[];
  onWorkplaceFilterChange: (workplaceTypes: WorkType[]) => void;
  search: string;
  onSearchChange: (search: string) => void;
  sortBy: JobSortBy;
  onSortByChange: (sortBy: JobSortBy) => void;
  selectedIds: Set<string>;
  onSelectedIdsChange: (selectedIds: Set<string>) => void;
}) {
  // Callback ref backed by state so the virtualizer re-runs once the base-ui
  // ScrollArea viewport actually mounts — a plain useRef leaves the list empty
  // on first paint because nothing re-renders when the element attaches.
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null);
  const selectedJobIds = Array.from(selectedIds);

  const virtualizer = useVirtualizer({
    count: jobs.length,
    getScrollElement: () => scrollElement,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
    getItemKey: (index) => jobs[index].id,
    // Render a screenful before the viewport is measured. Without this the
    // virtualizer's range is null while outerSize is 0, so the list stays blank
    // until the ScrollArea viewport's ResizeObserver fires — seconds on a slow
    // machine. The real size takes over as soon as it's observed.
    initialRect: { width: 384, height: 800 },
  });

  function toggleSelected(jobId: string, checked: boolean) {
    const next = new Set(selectedIds);
    if (checked) {
      next.add(jobId);
    } else {
      next.delete(jobId);
    }
    onSelectedIdsChange(next);
  }

  return (
    <div className="flex h-[calc(100vh-7rem)] overflow-hidden rounded-lg border">
      <div className="flex min-h-0 w-96 shrink-0 flex-col border-r">
        <JobsFilterBar
          statusFilter={statusFilter}
          onStatusFilterChange={onStatusFilterChange}
          workplaceFilter={workplaceFilter}
          onWorkplaceFilterChange={onWorkplaceFilterChange}
          search={search}
          onSearchChange={onSearchChange}
          sortBy={sortBy}
          onSortByChange={onSortByChange}
        />

        <div className="border-b px-4 py-2 text-muted-foreground text-xs">
          {jobs.length} {jobs.length === 1 ? "job" : "jobs"}
        </div>

        <ScrollArea viewportRef={setScrollElement} className="min-h-0 flex-1">
          {jobs.length === 0 ? (
            <p className="p-4 text-muted-foreground text-sm">No jobs match your filters.</p>
          ) : (
            <ul className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
              {virtualizer.getVirtualItems().map((virtualItem) => {
                const job = jobs[virtualItem.index];
                return (
                  <li
                    key={virtualItem.key}
                    className="absolute inset-x-0 top-0 border-b"
                    style={{
                      height: virtualItem.size,
                      transform: `translateY(${virtualItem.start}px)`,
                    }}
                  >
                    <JobListItem
                      job={job}
                      selected={selectedJob?.id === job.id}
                      onSelect={() => onSelectJob(job.id)}
                      checked={selectedIds.has(job.id)}
                      onCheckedChange={(checked) => toggleSelected(job.id, checked)}
                      selectedJobIds={selectedJobIds}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {selectedJob ? (
          <JobDetail job={selectedJob} />
        ) : (
          <p className="text-muted-foreground">Select a job to view details</p>
        )}
      </div>
    </div>
  );
}
