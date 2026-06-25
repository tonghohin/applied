import { PageLayout } from "@/components/page-layout";
import { CriteriaForm } from "@/components/settings/criteria-form";
import { ScheduleForm } from "@/components/settings/schedule-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSession } from "@/lib/session";
import { getProfile } from "@repo/api";
import { getDb } from "@repo/db";
import { redirect } from "next/navigation";

export default async function JobSearchSettingsPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const data = await getProfile(getDb(), session.user.id);

  return (
    <PageLayout title="Job search" section="Settings">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Criteria</CardTitle>
            <CardDescription>
              What to search for and how jobs are scored against your profile.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CriteriaForm initial={data.criteria} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Schedule</CardTitle>
            <CardDescription>
              When searches run automatically using the criteria above.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScheduleForm initial={data.schedule ?? null} />
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}
