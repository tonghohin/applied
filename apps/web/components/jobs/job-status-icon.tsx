import { Spinner } from "@/components/ui/spinner";
import type { JobStatus } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import {
  type RemixiconComponentType,
  RiCheckLine,
  RiErrorWarningLine,
  RiSkipForwardLine,
  RiThumbDownLine,
  RiTimeLine,
} from "@remixicon/react";
import type { ComponentProps } from "react";

const STATUS_ICON: Record<JobStatus, RemixiconComponentType> = {
  pending_review: RiTimeLine,
  applying: Spinner,
  applied: RiCheckLine,
  rejected: RiThumbDownLine,
  failed: RiErrorWarningLine,
  skipped: RiSkipForwardLine,
};

const STATUS_ICON_CLASS: Record<JobStatus, string> = {
  pending_review: "text-muted-foreground",
  applying: "text-muted-foreground",
  applied: "text-primary",
  rejected: "text-muted-foreground",
  failed: "text-destructive",
  skipped: "text-muted-foreground",
};

export function StatusIcon({
  status,
  className,
  ...props
}: { status: JobStatus } & ComponentProps<RemixiconComponentType>) {
  const Icon = STATUS_ICON[status];
  return <Icon className={cn(STATUS_ICON_CLASS[status], className)} {...props} />;
}
