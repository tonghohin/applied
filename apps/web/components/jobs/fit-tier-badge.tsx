import { Badge, type BadgeVariant } from "@/components/ui/badge";
import type { FitTier } from "@/lib/trpc";
import { toTitleCase } from "@repo/shared";

const FIT_TIER_VARIANT: Record<FitTier, BadgeVariant> = {
  strong: "default",
  potential: "warning",
  weak: "secondary",
};

export function FitTierBadge({ tier }: { tier: FitTier }) {
  return <Badge variant={FIT_TIER_VARIANT[tier]}>{toTitleCase(tier)}</Badge>;
}
