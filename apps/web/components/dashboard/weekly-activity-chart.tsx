"use client";

import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { DashboardJob } from "@repo/api";
import { addDays, eachDayOfInterval, format, isSameDay, startOfISOWeek } from "date-fns";
import { Bar, BarChart, XAxis } from "recharts";

const chartConfig = {
  applied: { label: "Applied", color: "var(--primary)" },
  failed: { label: "Failed", color: "var(--destructive)" },
  remaining: { label: "Found", color: "var(--accent)" },
} satisfies ChartConfig;

export function WeeklyActivityChart({ jobs }: { jobs: DashboardJob[] }) {
  const weekStart = startOfISOWeek(new Date());
  const weekDays = eachDayOfInterval({ start: weekStart, end: addDays(weekStart, 6) });

  const chartData = weekDays.map((day) => {
    const found = jobs.filter((job) => isSameDay(job.createdAt, day)).length;
    const applied = jobs.filter((job) => job.appliedAt && isSameDay(job.appliedAt, day)).length;
    const failed = jobs.filter(
      (job) => job.status === "failed" && isSameDay(job.updatedAt, day)
    ).length;
    return {
      day: format(day, "EEEE"),
      applied,
      failed,
      remaining: Math.max(0, found - applied - failed),
    };
  });

  const totalApplied = chartData.reduce((acc, entry) => acc + entry.applied, 0);
  const totalFailed = chartData.reduce((acc, entry) => acc + entry.failed, 0);
  const totalFound = chartData.reduce(
    (acc, entry) => acc + entry.applied + entry.failed + entry.remaining,
    0
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Weekly activity</CardTitle>
        <CardAction>
          <span className="font-mono text-muted-foreground text-xs">
            {totalApplied} applied · {totalFailed} failed · {totalFound} found
          </span>
        </CardAction>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-30 w-full">
          <BarChart data={chartData} barCategoryGap="20%">
            <XAxis dataKey="day" tickLine={false} axisLine={false} />
            <Bar dataKey="applied" stackId="a" fill={chartConfig.applied.color} radius={2} />
            <Bar dataKey="failed" stackId="a" fill={chartConfig.failed.color} radius={2} />
            <Bar dataKey="remaining" stackId="a" fill={chartConfig.remaining.color} radius={2} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
