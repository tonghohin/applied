import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PingDot } from "@/components/ui/ping-dot";
import type { DashboardStats } from "@repo/api";
import type { SearchRun } from "@repo/db";
import { capitalize } from "@repo/shared";
import { formatDistanceToNow } from "date-fns";

const META_ROWS = [
  { key: "autoApply", label: "Auto-apply", value: "Not implemented yet" },
] as const;

function nextScheduledLabel(searchSchedule: DashboardStats["searchSchedule"]) {
  if (!searchSchedule.enabled) return "Disabled";
  if (!searchSchedule.nextRunAt) return "Waiting for setup";
  return capitalize(formatDistanceToNow(searchSchedule.nextRunAt, { addSuffix: true }));
}

export function AgentStatus({
  searchRuns,
  searchSchedule,
}: {
  searchRuns: SearchRun[];
  searchSchedule: DashboardStats["searchSchedule"];
}) {
  const lastRunAt = searchRuns.find((run) => run.status === "completed")?.completedAt ?? null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2.5">
          <PingDot />
          Agent status
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3.5 text-sm">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span>Last run</span>
            <span className="font-medium">
              {lastRunAt
                ? capitalize(formatDistanceToNow(lastRunAt, { addSuffix: true }))
                : "Never"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>Next scheduled</span>
            <span className="font-medium">{nextScheduledLabel(searchSchedule)}</span>
          </div>
          {META_ROWS.map(({ key, label, value }) => (
            <div key={key} className="flex items-center justify-between">
              <span>{label}</span>
              <span className="font-medium">{value}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
