"use client";

import { PageLayout } from "@/components/page-layout";
import { trpc } from "@/lib/trpc";
import type { RouterOutputs } from "@repo/api";
import { RunsDataTable } from "./runs-data-table";

type Runs = RouterOutputs["runs"]["list"];

export function RunsClient({ initialRuns }: { initialRuns: Runs }) {
  const { data: runs = [] } = trpc.runs.list.useQuery(undefined, { initialData: initialRuns });

  return (
    <PageLayout title="Runs">
      <RunsDataTable runs={runs} />
    </PageLayout>
  );
}
