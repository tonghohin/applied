import { DataTable } from "@/components/ui/data-table";
import type { Run } from "@/lib/trpc";
import { columns } from "./runs-columns";

export function RunsDataTable({ runs }: { runs: Run[] }) {
  return (
    <DataTable
      data={runs}
      columns={columns}
      getRowId={(row) => row.id}
      initialSorting={[{ id: "startedAt", desc: true }]}
      emptyMessage="No runs yet. Start a job search to see results here."
    />
  );
}
