import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { FitTier, Job } from "@/lib/trpc";
import { RiInformationLine } from "@remixicon/react";
import { capitalize, toTitleCase } from "@repo/shared";
import type { ColumnDef } from "@tanstack/react-table";
import { formatDistanceToNow } from "date-fns";
import { FitTierBadge } from "./fit-tier-badge";
import { JobStatusSelect } from "./job-status-select";
import { JobTitleCell } from "./job-title-cell";

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
    id: "job",
    accessorFn: (row) => `${row.title} ${row.company} ${row.location}`,
    header: ({ column }) => (
      <span className="flex items-center gap-1">
        <DataTableColumnHeader column={column} title="Job" />
        <Tooltip>
          <TooltipTrigger
            aria-label="How to exclude keywords"
            className="text-muted-foreground hover:text-foreground"
          >
            <RiInformationLine className="size-3.5" />
          </TooltipTrigger>
          <TooltipContent>
            Highlight a word or phrase in a title to exclude it from future searches
          </TooltipContent>
        </Tooltip>
      </span>
    ),
    cell: ({ row, table }) => <JobTitleCell job={row.original} table={table} row={row} />,
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
    cell: ({ row }) => <JobStatusSelect job={row.original} />,
    filterFn: "arrIncludesSome",
    enableGlobalFilter: false,
  },
  {
    accessorKey: "createdAt",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Added" />,
    cell: ({ getValue }) => {
      const value = getValue<Date>();
      return capitalize(formatDistanceToNow(value, { addSuffix: true }));
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
      const hasLogs = job.latestApplyRun !== null;
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
];
