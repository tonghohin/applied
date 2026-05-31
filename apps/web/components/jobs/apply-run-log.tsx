import type { Job } from "@/lib/trpc";
import { format } from "date-fns";

type ApplyRun = NonNullable<Job["latestApplyRun"]>;

export function ApplyRunLog({ applyRun }: { applyRun: ApplyRun }) {
  return (
    <div className="space-y-1 rounded-md bg-muted/50 p-3 font-mono text-xs">
      {applyRun.errorMessage && (
        <p className="mb-2 text-destructive">Error: {applyRun.errorMessage}</p>
      )}
      {applyRun.logs.map((entry, index) => (
        <div key={`${index}:${entry.timestamp}`} className="flex gap-3">
          <span className="shrink-0 text-muted-foreground/60">
            {format(new Date(entry.timestamp), "h:mm:ss a")}
          </span>
          <span className="text-foreground">{entry.message}</span>
        </div>
      ))}
      {applyRun.logs.length === 0 && (
        <p className="text-muted-foreground italic">No log entries recorded.</p>
      )}
    </div>
  );
}
