import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PingDot } from "@/components/ui/ping-dot";
import type { SearchRun } from "@repo/db";
import { capitalize } from "@repo/shared";
import { formatDistanceToNow } from "date-fns";

const META_ROWS = [
  { key: "nextScheduled", label: "Next scheduled", value: "Manual only" },
  { key: "autoApply", label: "Auto-apply", value: "Not implemented yet" },
] as const;

export function AgentStatus({ searchRuns }: { searchRuns: SearchRun[] }) {
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
