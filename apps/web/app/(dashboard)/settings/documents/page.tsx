import { PageLayout } from "@/components/page-layout";
import { CoverLetterForm } from "@/components/settings/cover-letter-form";
import { ResumeForm } from "@/components/settings/resume-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSession } from "@/lib/session";
import { getProfile } from "@repo/api";
import { db } from "@repo/db";
import { redirect } from "next/navigation";

export default async function DocumentsSettingsPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const data = await getProfile(db, session.user.id);

  return (
    <PageLayout title="Documents" section="Settings">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>
              Resume <span className="text-destructive">*</span>
            </CardTitle>
            <CardDescription>
              The agent generates a PDF from this text for every application.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResumeForm initial={data.profile} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Cover letter instructions</CardTitle>
            <CardDescription>
              Optionally describe your preferred tone, length, or things to emphasize. The AI writes
              a personalized cover letter for each job using your resume — no instructions needed to
              get started.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CoverLetterForm initial={data.profile} />
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}
