import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import type { JobStatus } from "@/lib/trpc";
import {
  type RemixiconComponentType,
  RiCheckLine,
  RiErrorWarningLine,
  RiSkipForwardLine,
  RiThumbDownLine,
  RiTimeLine,
} from "@remixicon/react";
import { toTitleCase } from "@repo/shared/src/utils";
import type { ComponentProps } from "react";

const STATUS_VARIANT: Record<JobStatus, BadgeVariant> = {
  pending_review: "secondary",
  applying: "warning",
  applied: "default",
  rejected: "outline",
  failed: "destructive",
  skipped: "outline",
};

export const STATUS_ICON: Record<JobStatus, RemixiconComponentType> = {
  pending_review: RiTimeLine,
  applying: Spinner,
  applied: RiCheckLine,
  rejected: RiThumbDownLine,
  failed: RiErrorWarningLine,
  skipped: RiSkipForwardLine,
};

export function JobStatusBadge({
  status,
  ...props
}: { status: JobStatus } & ComponentProps<typeof Badge>) {
  const Icon = STATUS_ICON[status];
  return (
    <Badge variant={STATUS_VARIANT[status]} {...props}>
      <Icon data-icon="inline-start" />
      {toTitleCase(status)}
    </Badge>
  );
}
