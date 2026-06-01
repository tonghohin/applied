import { cn } from "@/lib/utils";

function PingDot({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div className={cn("relative size-2.5 shrink-0", className)} {...props}>
      <div className="absolute inset-0 animate-ping rounded-full bg-primary opacity-30" />
      <div className="relative block size-full rounded-full bg-primary" />
    </div>
  );
}

export { PingDot };
