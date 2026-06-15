import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import type { Run, RunStatus } from "@/lib/trpc";
import { toTitleCase } from "@repo/shared";
import type { ColumnDef } from "@tanstack/react-table";
import {
  differenceInMilliseconds,
  formatDistanceToNow,
  formatDuration,
  intervalToDuration,
} from "date-fns";
import { RunStatusBadge } from "./run-status-badge";

export const columns: ColumnDef<Run>[] = [
  {
    accessorKey: "platform",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Platform" />,
    cell: ({ getValue }) => toTitleCase(getValue<string>()),
    enableColumnFilter: false,
  },
  {
    accessorKey: "status",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
    cell: ({ getValue }) => <RunStatusBadge status={getValue<RunStatus>()} />,
    filterFn: "arrIncludesSome",
    enableGlobalFilter: false,
  },
  {
    accessorKey: "completedAt",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Completed" />,
    cell: ({ getValue }) => {
      const value = getValue<Date | null>();
      return value ? toTitleCase(formatDistanceToNow(value, { addSuffix: true })) : "—";
    },
    sortingFn: "datetime",
    enableColumnFilter: false,
    enableGlobalFilter: false,
  },
  {
    id: "duration",
    accessorFn: (row) =>
      row.completedAt ? differenceInMilliseconds(row.completedAt, row.startedAt) : null,
    header: ({ column }) => <DataTableColumnHeader column={column} title="Duration" />,
    cell: ({ row }) => {
      const { startedAt, completedAt } = row.original;
      if (!completedAt) return "—";
      return formatDuration(intervalToDuration({ start: startedAt, end: completedAt }));
    },
    enableColumnFilter: false,
    enableGlobalFilter: false,
  },
  {
    accessorKey: "jobCount",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Jobs" />,
    cell: ({ row }) => (row.original.status === "failed" ? "—" : row.original.jobCount),
    enableColumnFilter: false,
    enableGlobalFilter: false,
  },
  {
    accessorKey: "errorMessage",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Error" />,
    cell: ({ getValue }) => {
      const message = getValue<string | null>();
      if (!message) return "—";
      return (
        <span className="max-w-xs truncate text-destructive text-xs" title={message}>
          {message}
        </span>
      );
    },
    enableColumnFilter: false,
  },
];
