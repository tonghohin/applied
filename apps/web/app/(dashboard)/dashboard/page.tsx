import { DashboardClient } from "@/components/dashboard/dashboard-client";
import { getSession } from "@/lib/session";
import { getDashboardStats } from "@repo/api";
import { getDb, getJobCriteriaForUser, getLinkedInAccount } from "@repo/db";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in");

  const [stats, criteria, linkedInAccount] = await Promise.all([
    getDashboardStats(getDb(), session.user.id),
    getJobCriteriaForUser(getDb(), session.user.id),
    getLinkedInAccount(getDb(), session.user.id),
  ]);

  return (
    <DashboardClient
      initialData={stats}
      criteria={criteria}
      linkedInConnected={linkedInAccount !== null}
    />
  );
}
