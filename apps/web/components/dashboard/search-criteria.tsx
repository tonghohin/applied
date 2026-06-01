import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RiArrowRightLine } from "@remixicon/react";
import type { getJobCriteriaForUser } from "@repo/db";
import Link from "next/link";

type Criteria = Awaited<ReturnType<typeof getJobCriteriaForUser>>;

function CriteriaRow({ label, values }: { label: string; values: string[] }) {
  if (values.length === 0) return null;
  return (
    <div className="flex items-start gap-3 text-sm">
      <span className="w-20 shrink-0">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {values.map((value) => (
          <Badge key={value} variant="secondary">
            {value}
          </Badge>
        ))}
      </div>
    </div>
  );
}

export function SearchCriteria({
  criteria,
  linkedInConnected,
}: {
  criteria: Criteria;
  linkedInConnected: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Search criteria</CardTitle>
        <CardAction>
          <Button variant="ghost" size="sm" render={<Link href="/profile" />}>
            Edit <RiArrowRightLine />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-3">
          <CriteriaRow
            label="Roles"
            values={[
              ...(criteria?.jobTitle ? [criteria.jobTitle] : []),
              ...(criteria?.skills ?? []),
            ]}
          />
          <CriteriaRow
            label="Locations"
            values={criteria?.locations.map((loc) => loc.location) ?? []}
          />
          <CriteriaRow label="Seniority" values={criteria?.seniority ?? []} />
          <CriteriaRow
            label="Min salary"
            values={
              criteria?.minSalary
                ? [
                    new Intl.NumberFormat("en-US", {
                      style: "currency",
                      currency: "USD",
                      maximumFractionDigits: 0,
                    }).format(criteria.minSalary),
                  ]
                : []
            }
          />
          <CriteriaRow label="LinkedIn" values={[linkedInConnected ? "Yes" : "No"]} />
        </div>
      </CardContent>
    </Card>
  );
}
