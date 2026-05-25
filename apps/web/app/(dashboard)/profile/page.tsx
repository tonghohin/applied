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
    <div className="p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-semibold mb-6">Profile</h1>
      <ProfileContent initialData={data} />
    </div>
  );
}
