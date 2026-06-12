import { PageLayout } from "@/components/page-layout";
import { PersonalForm } from "@/components/settings/personal-form";
import { getSession } from "@/lib/session";
import { getProfile } from "@repo/api";
import { db } from "@repo/db";
import { redirect } from "next/navigation";

export default async function PersonalSettingsPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const data = await getProfile(db, session.user.id);

  return (
    <PageLayout title="Personal info">
      <PersonalForm initial={data.profile} />
    </PageLayout>
  );
}
