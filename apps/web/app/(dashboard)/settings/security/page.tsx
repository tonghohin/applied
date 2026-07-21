import { PageLayout } from "@/components/page-layout";
import { ChangePasswordForm } from "@/components/settings/change-password-form";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function SecuritySettingsPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in");

  return (
    <PageLayout title="Security" section="Settings">
      <ChangePasswordForm />
    </PageLayout>
  );
}
