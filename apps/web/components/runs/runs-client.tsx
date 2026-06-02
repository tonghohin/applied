"use client";

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
import { RiHistoryLine } from "@remixicon/react";
import type { RouterOutputs } from "@repo/api";
import { RunsDataTable } from "./runs-data-table";

type Runs = RouterOutputs["runs"]["list"];

export function RunsClient({ initialRuns }: { initialRuns: Runs }) {
  const { data: runs = [] } = trpc.runs.list.useQuery(undefined, { initialData: initialRuns });

  return (
    <PageLayout title="Runs">
      {runs.length === 0 ? (
        <Empty className="min-h-80 border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <RiHistoryLine />
            </EmptyMedia>
            <EmptyContent>
              <EmptyTitle>No runs yet</EmptyTitle>
              <EmptyDescription>Start a job search to see activity here.</EmptyDescription>
            </EmptyContent>
            <SearchJobsButton />
          </EmptyHeader>
        </Empty>
      ) : (
        <RunsDataTable runs={runs} />
      )}
    </PageLayout>
  );
}
