import { RunsClient } from "@/components/runs/runs-client";
import { getSession } from "@/lib/session";
import { listSearchRuns } from "@repo/api";
import { db } from "@repo/db";
import { redirect } from "next/navigation";

export default async function RunsPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const runs = await listSearchRuns(db, session.user.id);

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <RunsClient initialRuns={runs} />
    </div>
  );
}
