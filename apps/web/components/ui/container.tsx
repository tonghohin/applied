import { cn } from "@/lib/utils";
import type * as React from "react";

function Container({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("mx-auto w-full max-w-280 px-8 max-[560px]:px-5", className)}
      {...props}
    />
  );
}

export { Container };
