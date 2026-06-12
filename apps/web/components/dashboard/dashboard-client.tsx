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
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { trpc } from "@/lib/trpc";
import { RiDashboardLine } from "@remixicon/react";
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
  const { jobs, searchRuns, searchSchedule } = data ?? initialData;

  const isEmpty = jobs.length === 0 && searchRuns.length === 0;

  return (
    <PageLayout
      title="Dashboard"
      action={
        <div className="flex items-center gap-2">
          <Button variant="outline" nativeButton={false} render={<Link href="/runs" />}>
            View runs
          </Button>
          <SearchJobsButton />
        </div>
      }
    >
      {isEmpty ? (
        <Empty className="min-h-80 border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <RiDashboardLine />
            </EmptyMedia>
            <EmptyContent>
              <EmptyTitle>No activity yet</EmptyTitle>
              <EmptyDescription>
                Search LinkedIn for positions matching your profile to fill your dashboard.
              </EmptyDescription>
            </EmptyContent>
            <SearchJobsButton />
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <StatCards jobs={jobs} />

          <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-5">
            <div className="grid grid-rows-[auto_1fr] gap-5 lg:col-span-3">
              <WeeklyActivityChart jobs={jobs} />
              <ActivityFeed jobs={jobs} />
            </div>
            <div className="grid grid-rows-[auto_auto_1fr] gap-5 lg:col-span-2">
              <AgentStatus searchRuns={searchRuns} searchSchedule={searchSchedule} />
              <ApplicationStatus jobs={jobs} />
              <SearchCriteria criteria={criteria} linkedInConnected={linkedInConnected} />
            </div>
          </div>
        </>
      )}
    </PageLayout>
  );
}
