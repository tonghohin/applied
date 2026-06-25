import { RunsClient } from "@/components/runs/runs-client";
import { getSession } from "@/lib/session";
import { listSearchRuns } from "@repo/api";
import { getDb } from "@repo/db";
import { redirect } from "next/navigation";

export default async function RunsPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const runs = await listSearchRuns(getDb(), session.user.id);

  return <RunsClient initialRuns={runs} />;
}
