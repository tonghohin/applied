"use client";

import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { env } from "@/lib/env";
import { trpc } from "@/lib/trpc";
import { RiDownloadCloud2Line } from "@remixicon/react";

export function AppVersionIndicator() {
  const { data: latestVersion } = trpc.system.latestVersion.useQuery(undefined, {
    staleTime: 30 * 60 * 1000,
  });

  const hasUpdate = !!latestVersion && latestVersion !== env.NEXT_PUBLIC_APP_VERSION;

  if (!hasUpdate) {
    return (
      <div className="flex flex-1 justify-end truncate">
        <Badge variant="secondary">{env.NEXT_PUBLIC_APP_VERSION}</Badge>
      </div>
    );
  }

  return (
    <div className="flex flex-1 justify-end truncate">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>
            <Badge variant="warning">
              {env.NEXT_PUBLIC_APP_VERSION}
              <RiDownloadCloud2Line data-icon="inline-end" />
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="right">Update available</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
