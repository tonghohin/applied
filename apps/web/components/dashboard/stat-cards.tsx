import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { IconBadge } from "@/components/ui/icon-badge";
import { RiFocus3Line, RiInboxLine, RiSendPlaneLine } from "@remixicon/react";
import type { DashboardJob } from "@repo/api";

const STATS = [
  {
    key: "applied",
    label: "Applications sent",
    description: "Across all your searches",
    icon: <IconBadge icon={RiSendPlaneLine} />,
    count: (jobs: DashboardJob[]) => jobs.filter((job) => job.status === "applied").length,
  },
  {
    key: "pending",
    label: "Pending review",
    description: "Awaiting your approval to apply",
    icon: <IconBadge icon={RiInboxLine} variant="secondary" />,
    count: (jobs: DashboardJob[]) => jobs.filter((job) => job.status === "pending_review").length,
  },
  {
    key: "strong",
    label: "Strong matches",
    description: "Best alignment with your profile",
    icon: <IconBadge icon={RiFocus3Line} variant="secondary" />,
    count: (jobs: DashboardJob[]) => jobs.filter((job) => job.fitTier === "strong").length,
  },
];

export function StatCards({ jobs }: { jobs: DashboardJob[] }) {
  return (
    <div className="grid grid-cols-3 gap-3.5">
      {STATS.map(({ key, label, description, icon, count }) => (
        <Card key={key}>
          <CardHeader>
            <CardTitle>{label}</CardTitle>
            <CardAction>{icon}</CardAction>
          </CardHeader>
          <CardContent>
            <div className="font-semibold text-3xl tracking-tight">{count(jobs)}</div>
            <p className="mt-1 text-muted-foreground text-xs">{description}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
