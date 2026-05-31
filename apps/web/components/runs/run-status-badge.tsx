import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import type { RunStatus } from "@/lib/trpc";
import { toTitleCase } from "@repo/shared";

const RUN_STATUS_VARIANT: Record<RunStatus, BadgeVariant> = {
  completed: "default",
  failed: "destructive",
  running: "warning",
  pending: "secondary",
};

export function RunStatusBadge({ status }: { status: RunStatus }) {
  return (
    <Badge variant={RUN_STATUS_VARIANT[status]}>
      {status === "running" && <Spinner data-icon="inline-start" />}
      {toTitleCase(status)}
    </Badge>
  );
}
