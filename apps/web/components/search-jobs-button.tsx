"use client";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export function SearchJobsButton({ disabledReason }: { disabledReason?: string }) {
  const searchMutation = trpc.jobs.search.useMutation({
    onSuccess: () => {
      toast.success("Search started", { description: "Jobs will appear shortly." });
    },
    onError: (err) => {
      toast.error("Search failed", { description: err.message });
    },
  });

  const button = (
    <Button
      // Keeps the disabled button hoverable/focusable so its tooltip can open.
      focusableWhenDisabled
      className="aria-disabled:opacity-50"
      disabled={disabledReason !== undefined || searchMutation.isPending}
      onClick={() => searchMutation.mutate()}
    >
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

  if (disabledReason === undefined) return button;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger render={button} />
        <TooltipContent>{disabledReason}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
