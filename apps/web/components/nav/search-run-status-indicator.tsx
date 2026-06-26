"use client";

import { SidebarMenuBadge } from "@/components/ui/sidebar";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { trpc } from "@/lib/trpc";
import { RiErrorWarningLine } from "@remixicon/react";

export function SearchRunStatusIndicator() {
  const { data: run } = trpc.runs.latest.useQuery(undefined, {
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "pending" || status === "running" ? 3000 : false;
    },
  });

  if (!run || run.status === "completed") return null;

  if (run.status === "pending" || run.status === "running") {
    return (
      <SidebarMenuBadge>
        <Spinner />
      </SidebarMenuBadge>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger render={<SidebarMenuBadge className="pointer-events-auto" />}>
          <RiErrorWarningLine className="size-4 text-destructive" />
        </TooltipTrigger>
        <TooltipContent side="right">Search failed: {run.errorMessage}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
