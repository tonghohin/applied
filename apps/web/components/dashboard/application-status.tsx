"use client";

import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type ChartConfig, ChartContainer } from "@/components/ui/chart";
import { RiArrowRightLine } from "@remixicon/react";
import type { DashboardJob } from "@repo/api";
import type { jobStatusEnum } from "@repo/db";
import { toTitleCase } from "@repo/shared";
import Link from "next/link";
import { Bar, BarChart, LabelList, XAxis, YAxis } from "recharts";

const chartConfig = {
  pending_review: { label: "Pending Review", color: "var(--chart-3)" },
  applying: { label: "Applying", color: "var(--chart-2)" },
  applied: { label: "Applied", color: "var(--chart-1)" },
  rejected: { label: "Rejected", color: "var(--chart-4)" },
  failed: { label: "Failed", color: "var(--destructive)" },
  skipped: { label: "Skipped", color: "var(--chart-5)" },
} satisfies ChartConfig;

type JobStatus = (typeof jobStatusEnum.enumValues)[number];

const PIPELINE_STAGES: JobStatus[] = [
  "pending_review",
  "applying",
  "applied",
  "rejected",
  "failed",
  "skipped",
];

export function ApplicationStatus({ jobs }: { jobs: DashboardJob[] }) {
  const chartData = PIPELINE_STAGES.map((key) => ({
    status: toTitleCase(key),
    count: jobs.filter((job) => job.status === key).length,
    fill: chartConfig[key].color,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Application status</CardTitle>
        <CardAction>
          <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/jobs" />}>
            Open jobs <RiArrowRightLine />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-36 w-full">
          <BarChart data={chartData} layout="vertical" barCategoryGap="25%">
            <YAxis dataKey="status" type="category" tickLine={false} axisLine={false} width={56} />
            <XAxis type="number" hide />
            <Bar dataKey="count" radius={2} minPointSize={2}>
              <LabelList
                dataKey="count"
                position="right"
                className="fill-foreground font-medium font-mono tabular-nums"
              />
            </Bar>
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
