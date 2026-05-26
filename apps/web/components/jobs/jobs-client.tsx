"use client";

import { EmptyState } from "@/components/jobs/empty-state";
import { JobListSkeleton } from "@/components/jobs/job-list-skeleton";
import { JobTabs } from "@/components/jobs/job-tabs";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import type { RouterOutputs } from "@repo/api";
import { getMissingSearchFields } from "@repo/shared";
import { toast } from "sonner";

type InitialJobs = RouterOutputs["jobs"]["list"];
type InitialProfileData = RouterOutputs["profile"]["getProfile"];

export function JobsClient({
  initialJobs,
  initialProfileData,
}: {
  initialJobs: InitialJobs;
  initialProfileData: InitialProfileData;
}) {
  const { data: jobs = [], isLoading } = trpc.jobs.list.useQuery(undefined, {
    initialData: initialJobs,
  });
  const { data: profileData } = trpc.profile.getProfile.useQuery(undefined, {
    initialData: initialProfileData,
  });
  const missingFields = getMissingSearchFields(profileData?.profile, profileData?.criteria, profileData?.linkedinAccount);

  const searchMutation = trpc.jobs.search.useMutation({
    onSuccess: () => {
      toast.success("Search started", { description: "Jobs will appear shortly." });
    },
    onError: (err) => {
      if (err.data?.code === "PRECONDITION_FAILED") {
        toast.error("Complete your profile first", { description: err.message });
      } else {
        const description = missingFields.length > 0 ? missingFields.join(", ") : err.message;
        toast.error("Complete your profile first", { description });
      }
    },
  });

  const isReady = missingFields.length === 0;

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Jobs</h1>
        <Button
          onClick={() => {
            if (!isReady) {
              toast.error("Complete your profile first", {
                description: missingFields.join(", "),
              });
              return;
            }
            searchMutation.mutate();
          }}
          disabled={searchMutation.isPending}
        >
          {searchMutation.isPending ? "Searching…" : "Search Jobs"}
        </Button>
      </div>
      {isLoading ? (
        <JobListSkeleton />
      ) : jobs.length === 0 ? (
        <EmptyState
          title="No jobs yet"
          description="Click Search Jobs to find matching positions."
        />
      ) : (
        <JobTabs jobs={jobs} />
      )}
    </>
  );
}
