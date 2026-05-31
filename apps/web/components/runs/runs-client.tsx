"use client";

import { trpc } from "@/lib/trpc";
import type { RouterOutputs } from "@repo/api";
import { RunsDataTable } from "./runs-data-table";

type Runs = RouterOutputs["runs"]["list"];

export function RunsClient({ initialRuns }: { initialRuns: Runs }) {
  const { data: runs = [] } = trpc.runs.list.useQuery(undefined, { initialData: initialRuns });

  return (
    <>
      <h1 className="mb-6 font-semibold text-2xl">Runs</h1>
      <RunsDataTable runs={runs} />
    </>
  );
}
