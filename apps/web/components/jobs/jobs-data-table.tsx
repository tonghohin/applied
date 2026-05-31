import { DataTable } from "@/components/ui/data-table";
import type { Job } from "@/lib/trpc";
import { ApplyRunLog } from "./apply-run-log";
import { columns } from "./jobs-columns";

export function JobsDataTable({ jobs }: { jobs: Job[] }) {
  return (
    <DataTable
      data={jobs}
      columns={columns}
      getRowId={(row) => row.id}
      initialSorting={[{ id: "listedAt", desc: true }]}
      enableRowSelection={(row) =>
        row.original.status === "pending_review" ||
        row.original.status === "failed" ||
        row.original.status === "skipped"
      }
      renderSubRow={(row) =>
        row.original.latestApplyRun ? <ApplyRunLog applyRun={row.original.latestApplyRun} /> : null
      }
      emptyMessage="No jobs match the current filters."
    />
  );
}
