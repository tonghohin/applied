import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import type { JobStatus } from "@/lib/trpc";
import { toTitleCase } from "@repo/shared/src/utils";

const STATUS_VARIANT: Record<JobStatus, BadgeVariant> = {
  pending_review: "secondary",
  applying: "warning",
  applied: "default",
  failed: "destructive",
  skipped: "outline",
};

export function JobStatusBadge({ status }: { status: JobStatus }) {
  return (
    <Badge variant={STATUS_VARIANT[status]}>
      {status === "applying" && <Spinner data-icon="inline-start" />}
      {toTitleCase(status)}
    </Badge>
  );
}
