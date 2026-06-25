import { JobsClient } from "@/components/jobs/jobs-client";
import { getSession } from "@/lib/session";
import { listJobs } from "@repo/api";
import { getDb } from "@repo/db";
import { redirect } from "next/navigation";

export default async function JobsPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const jobs = await listJobs(getDb(), session.user.id);
  return <JobsClient initialJobs={jobs} />;
}
