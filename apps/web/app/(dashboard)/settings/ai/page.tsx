import { AiForm } from "@/components/settings/ai-form";
import { PageLayout } from "@/components/page-layout";
import { getSession } from "@/lib/session";
import { getProfile } from "@repo/api";
import { getDb } from "@repo/db";
import { redirect } from "next/navigation";

export default async function AiSettingsPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const data = await getProfile(getDb(), session.user.id);
  const hasAiKey = data.profile?.aiGatewayKeyEncrypted != null;

  return (
    <PageLayout title="AI provider" section="Settings">
      <AiForm initial={{ hasAiKey }} />
    </PageLayout>
  );
}
