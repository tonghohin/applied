import { DataTable } from "@/components/ui/data-table";
import type { Job, JobStatus } from "@/lib/trpc";
import { ApplyRunLog } from "./apply-run-log";
import { columns } from "./jobs-columns";

const DEFAULT_VISIBLE_STATUSES: JobStatus[] = ["pending_review", "applying", "applied", "failed"];

export function JobsDataTable({ jobs }: { jobs: Job[] }) {
  return (
    <DataTable
      data={jobs}
      columns={columns}
      getRowId={(row) => row.id}
      initialSorting={[{ id: "createdAt", desc: true }]}
      initialColumnFilters={[{ id: "status", value: DEFAULT_VISIBLE_STATUSES }]}
      enableRowSelection={(row) =>
        row.original.status === "pending_review" ||
        row.original.status === "failed" ||
        row.original.status === "skipped"
      }
      renderSubRow={(row) =>
        row.original.latestApplyRun ? <ApplyRunLog applyRun={row.original.latestApplyRun} /> : null
      }
      rowClassName={(row) => (row.original.status === "skipped" ? "opacity-60" : undefined)}
      emptyMessage="No jobs match the current filters."
    />
  );
}
