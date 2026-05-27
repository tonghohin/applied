"use client";

import { Badge, type BadgeVariant } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import type { RouterOutputs } from "@repo/api";
import { format, formatDuration, intervalToDuration } from "date-fns";

type Runs = RouterOutputs["runs"]["list"];
type RunStatus = Runs[number]["status"];

const STATUS_VARIANT: Record<RunStatus, BadgeVariant> = {
  completed: "default",
  failed: "destructive",
  running: "warning",
  pending: "secondary",
};

export function RunsClient({ initialRuns }: { initialRuns: Runs }) {
  const { data: runs = [] } = trpc.runs.list.useQuery(undefined, { initialData: initialRuns });

  return (
    <>
      <h1 className="mb-6 font-semibold text-2xl">Runs</h1>
      {runs.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No runs yet. Start a job search to see results here.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Platform</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Started</TableHead>
              <TableHead>Completed</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Jobs Found</TableHead>
              <TableHead>Error</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {runs.map((run) => (
              <TableRow key={run.id}>
                <TableCell className="capitalize">{run.platform}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[run.status]}>{run.status}</Badge>
                </TableCell>
                <TableCell>{format(run.startedAt, "MMM d, yyyy h:mm a")}</TableCell>
                <TableCell>
                  {run.completedAt ? format(run.completedAt, "MMM d, yyyy h:mm a") : "—"}
                </TableCell>
                <TableCell>
                  {run.completedAt
                    ? formatDuration(
                        intervalToDuration({ start: run.startedAt, end: run.completedAt })
                      )
                    : "—"}
                </TableCell>
                <TableCell>{run.status === "failed" ? "—" : run.jobCount}</TableCell>
                <TableCell className="max-w-xs truncate text-destructive text-xs">
                  {run.errorMessage ?? ""}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );
}
