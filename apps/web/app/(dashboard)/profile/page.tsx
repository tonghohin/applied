import { PageLayout } from "@/components/page-layout";
import { ProfileContent } from "@/components/profile/profile-content";
import { getSession } from "@/lib/session";
import { getProfile } from "@repo/api";
import { db } from "@repo/db";
import { redirect } from "next/navigation";

export default async function ProfilePage() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const data = await getProfile(db, session.user.id);

  return (
    <PageLayout title="Profile">
      <ProfileContent initialData={data} />
    </PageLayout>
  );
}
