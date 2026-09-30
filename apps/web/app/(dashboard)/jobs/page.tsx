import { JobsClient } from "@/components/jobs/jobs-client";
import { getSession } from "@/lib/session";
import { listJobs } from "@repo/api";
import { getDb, getJobCriteriaForUser, getLinkedInAccount, getProfileForUser } from "@repo/db";
import { getMissingSearchSetup } from "@repo/shared";
import { redirect } from "next/navigation";

export default async function JobsPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const [jobs, profile, criteria, linkedInAccount] = await Promise.all([
    listJobs(getDb(), session.user.id),
    getProfileForUser(getDb(), session.user.id),
    getJobCriteriaForUser(getDb(), session.user.id),
    getLinkedInAccount(getDb(), session.user.id),
  ]);
  return (
    <JobsClient
      initialJobs={jobs}
      missingSetupFields={getMissingSearchSetup(profile, criteria, linkedInAccount)}
    />
  );
}
