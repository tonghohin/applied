import { cn } from "@/lib/utils";
import Image from "next/image";
import type * as React from "react";

function Kicker({ className, children, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 font-medium font-mono text-muted-foreground text-xs uppercase tracking-widest",
        className
      )}
      {...props}
    >
      <Image src="/icon.svg" alt="Applied" width={12} height={12} aria-hidden />
      {children}
    </span>
  );
}

export { Kicker };
