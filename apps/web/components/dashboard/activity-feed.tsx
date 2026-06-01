import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { IconBadge } from "@/components/ui/icon-badge";
import { RiErrorWarningLine, RiSendPlaneLine, RiSkipRightLine } from "@remixicon/react";
import type { DashboardJob } from "@repo/api";
import { capitalize } from "@repo/shared";
import { formatDistanceToNow } from "date-fns";

type ActivityItem = {
  id: string;
  icon: React.ReactNode;
  label: React.ReactNode;
  createdAt: Date;
};

function buildActivity(jobs: DashboardJob[]): ActivityItem[] {
  return jobs
    .filter(
      (job) => job.status === "applied" || job.status === "failed" || job.status === "skipped"
    )
    .sort((jobA, jobB) => jobB.updatedAt.getTime() - jobA.updatedAt.getTime())
    .slice(0, 8)
    .map((job) => {
      if (job.status === "applied") {
        return {
          id: job.id,
          icon: <IconBadge icon={RiSendPlaneLine} variant="default" iconClassName="size-3.5" />,
          label: (
            <span>
              Applied to <span className="font-medium">{job.title}</span> at {job.company}
            </span>
          ),
          createdAt: job.appliedAt ?? job.updatedAt,
        };
      }
      if (job.status === "failed") {
        return {
          id: job.id,
          icon: (
            <IconBadge icon={RiErrorWarningLine} variant="destructive" iconClassName="size-3.5" />
          ),
          label: (
            <span>
              Could not apply to <span className="font-medium">{job.title}</span> at {job.company}
            </span>
          ),
          createdAt: job.updatedAt,
        };
      }
      return {
        id: job.id,
        icon: <IconBadge icon={RiSkipRightLine} variant="secondary" iconClassName="size-3.5" />,
        label: (
          <span>
            Skipped <span className="font-medium">{job.title}</span> at {job.company}
          </span>
        ),
        createdAt: job.updatedAt,
      };
    });
}

export function ActivityFeed({ jobs }: { jobs: DashboardJob[] }) {
  const items = buildActivity(jobs);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent activity</CardTitle>
      </CardHeader>
      {items.length === 0 ? (
        <CardContent className="text-muted-foreground text-sm">No activity yet.</CardContent>
      ) : (
        <CardContent className="flex flex-col divide-y divide-foreground/5">
          {items.map((item) => (
            <div key={item.id} className="flex gap-3 py-3 first:pt-0 last:pb-0">
              {item.icon}
              <div className="min-w-0 flex-1">
                <div className="text-sm leading-snug">{item.label}</div>
                <div className="mt-0.5 font-mono text-muted-foreground text-xs">
                  {capitalize(formatDistanceToNow(item.createdAt, { addSuffix: true }))}
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      )}
    </Card>
  );
}
