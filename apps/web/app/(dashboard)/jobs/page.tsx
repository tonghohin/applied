import { JobsClient } from "@/components/jobs/jobs-client";
import { getSession } from "@/lib/session";
import { getProfile, listJobs } from "@repo/api";
import { db } from "@repo/db";
import { redirect } from "next/navigation";

export default async function JobsPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const [jobs, profileData] = await Promise.all([
    listJobs(db, session.user.id),
    getProfile(db, session.user.id),
  ]);

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <JobsClient initialJobs={jobs} initialProfileData={profileData} />
    </div>
  );
}
