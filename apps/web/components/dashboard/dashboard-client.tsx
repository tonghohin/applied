"use client";

import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { AgentStatus } from "@/components/dashboard/agent-status";
import { ApplicationStatus } from "@/components/dashboard/application-status";
import { SearchCriteria } from "@/components/dashboard/search-criteria";
import { StatCards } from "@/components/dashboard/stat-cards";
import { WeeklyActivityChart } from "@/components/dashboard/weekly-activity-chart";
import { PageLayout } from "@/components/page-layout";
import { SearchJobsButton } from "@/components/search-jobs-button";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import type { DashboardStats } from "@repo/api";
import type { getJobCriteriaForUser } from "@repo/db";
import Link from "next/link";

type Criteria = Awaited<ReturnType<typeof getJobCriteriaForUser>>;

export function DashboardClient({
  initialData,
  criteria,
  linkedInConnected,
}: {
  initialData: DashboardStats;
  criteria: Criteria;
  linkedInConnected: boolean;
}) {
  const { data } = trpc.dashboard.getStats.useQuery(undefined, { initialData });
  const { jobs, searchRuns } = data ?? initialData;

  return (
    <PageLayout
      title="Dashboard"
      action={
        <div className="flex items-center gap-2">
          <Button variant="outline" render={<Link href="/runs" />}>
            View runs
          </Button>
          <SearchJobsButton />
        </div>
      }
    >
      <StatCards jobs={jobs} />

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-5">
        <div className="grid grid-rows-[auto_1fr] gap-5 lg:col-span-3">
          <WeeklyActivityChart jobs={jobs} />
          <ActivityFeed jobs={jobs} />
        </div>
        <div className="grid grid-rows-[auto_auto_1fr] gap-5 lg:col-span-2">
          <AgentStatus searchRuns={searchRuns} />
          <ApplicationStatus jobs={jobs} />
          <SearchCriteria criteria={criteria} linkedInConnected={linkedInConnected} />
        </div>
      </div>
    </PageLayout>
  );
}
