import { PageLayout } from "@/components/page-layout";
import { LinkedInForm } from "@/components/settings/linkedin-form";
import { getSession } from "@/lib/session";
import { getProfile } from "@repo/api";
import { getDb } from "@repo/db";
import { redirect } from "next/navigation";

export default async function LinkedInSettingsPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const data = await getProfile(getDb(), session.user.id);

  return (
    <PageLayout title="LinkedIn account" section="Settings">
      <LinkedInForm savedEmail={data.linkedinAccount?.email ?? null} />
    </PageLayout>
  );
}
