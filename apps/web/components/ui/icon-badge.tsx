import { cn } from "@/lib/utils";
import type { RemixiconComponentType } from "@remixicon/react";
import { type VariantProps, cva } from "class-variance-authority";

const iconBadgeVariants = cva(
  "flex size-7 shrink-0 items-center justify-center rounded-lg",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground",
        secondary: "bg-secondary text-secondary-foreground",
        destructive: "bg-destructive/10 text-destructive",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

function IconBadge({
  icon: Icon,
  iconClassName,
  className,
  variant,
}: VariantProps<typeof iconBadgeVariants> & {
  icon: RemixiconComponentType;
  iconClassName?: string;
  className?: string;
}) {
  return (
    <div className={cn(iconBadgeVariants({ variant }), className)}>
      <Icon className={cn("size-4", iconClassName)} />
    </div>
  );
}

export { IconBadge };
