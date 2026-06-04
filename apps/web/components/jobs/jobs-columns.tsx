import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import type { FitTier, Job, JobStatus } from "@/lib/trpc";
import type { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import Link from "next/link";
import { toTitleCase } from "@repo/shared";
import { ApplyButton } from "./apply-button";
import { FitTierBadge } from "./fit-tier-badge";
import { JobStatusBadge } from "./job-status-badge";
import { RestoreButton } from "./restore-button";
import { SkipButton } from "./skip-button";

export const columns: ColumnDef<Job>[] = [
  {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected()}
        indeterminate={table.getIsSomePageRowsSelected() && !table.getIsAllPageRowsSelected()}
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => {
      if (!row.getCanSelect()) return null;
      return (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
        />
      );
    },
    enableSorting: false,
    enableHiding: false,
    enableColumnFilter: false,
    enableGlobalFilter: false,
  },
  {
    accessorKey: "title",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Title" />,
    cell: ({ row }) => (
      <Link
        href={row.original.url}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium hover:underline"
      >
        {row.original.title}
      </Link>
    ),
    enableColumnFilter: false,
  },
  {
    accessorKey: "company",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Company" />,
    filterFn: "arrIncludesSome",
  },
  {
    accessorKey: "location",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Location" />,
    cell: ({ getValue }) => getValue<string | null>() ?? "—",
    enableColumnFilter: false,
  },
  {
    accessorKey: "workplaceType",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Workplace" />,
    cell: ({ getValue }) => toTitleCase(getValue<string>()),
    filterFn: "arrIncludesSome",
    enableGlobalFilter: false,
  },
  {
    accessorKey: "fitTier",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Fit" />,
    cell: ({ getValue }) => <FitTierBadge tier={getValue<FitTier>()} />,
    filterFn: "arrIncludesSome",
    enableGlobalFilter: false,
  },
  {
    accessorKey: "status",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
    cell: ({ getValue }) => <JobStatusBadge status={getValue<JobStatus>()} />,
    filterFn: "arrIncludesSome",
    enableGlobalFilter: false,
  },
  {
    accessorKey: "listedAt",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Listed" />,
    cell: ({ getValue }) => {
      const value = getValue<Date>();
      return format(value, "MMM d, yyyy");
    },
    sortingFn: "datetime",
    enableColumnFilter: false,
    enableGlobalFilter: false,
  },
  {
    id: "logs",
    accessorFn: (row) => row.latestApplyRun?.logs,
    header: ({ column }) => <DataTableColumnHeader column={column} title="Logs" />,
    cell: ({ row }) => {
      const job = row.original;
      const hasLogs =
        job.latestApplyRun !== null && (job.status === "applied" || job.status === "failed");
      if (!hasLogs) return <span className="text-muted-foreground text-xs">No logs</span>;
      return (
        <Button variant="ghost" size="xs" onClick={() => row.toggleExpanded()} className="-m-2">
          {row.getIsExpanded() ? "Hide" : "Show"}
        </Button>
      );
    },
    enableSorting: false,
    enableColumnFilter: false,
  },
  {
    id: "actions",
    cell: ({ row, table }) => {
      const { id, status } = row.original;
      if (!row.getCanSelect()) return null;
      if (status === "skipped") return <RestoreButton jobId={id} table={table} />;
      return (
        <div className="flex gap-1">
          <ApplyButton jobId={id} table={table} />
          <SkipButton jobId={id} table={table} />
        </div>
      );
    },
    enableSorting: false,
  },
];
