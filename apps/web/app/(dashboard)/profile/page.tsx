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
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="mb-6 font-semibold text-2xl">Profile</h1>
      <ProfileContent initialData={data} />
    </div>
  );
}
