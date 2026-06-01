"use client";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export function SearchJobsButton() {
  const searchMutation = trpc.jobs.search.useMutation({
    onSuccess: () => {
      toast.success("Search started", { description: "Jobs will appear shortly." });
    },
    onError: (err) => {
      toast.error("Search failed", { description: err.message });
    },
  });

  return (
    <Button disabled={searchMutation.isPending} onClick={() => searchMutation.mutate()}>
      {searchMutation.isPending ? (
        <>
          <Spinner className="mr-2" />
          Searching…
        </>
      ) : (
        "Search jobs"
      )}
    </Button>
  );
}
