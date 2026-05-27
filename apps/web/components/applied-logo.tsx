import { cn } from "@/lib/utils";
import Image from "next/image";

export function AppliedLockup({ className }: { className?: string }) {
  return (
    <>
      <Image
        src="/lockup.svg"
        alt="Applied"
        width={241}
        height={80}
        priority
        className={cn("h-8 w-fit dark:hidden", className)}
      />
      <Image
        src="/lockup-on-dark.svg"
        alt="Applied"
        width={241}
        height={80}
        priority
        className={cn("hidden h-8 w-fit dark:block", className)}
      />
    </>
  );
}

export function AppliedIcon({ className }: { className?: string }) {
  return (
    <>
      <Image
        src="/icon.svg"
        alt="Applied"
        width={100}
        height={100}
        className={cn("h-4 w-fit dark:hidden", className)}
      />
      <Image
        src="/icon-cream.svg"
        alt="Applied"
        width={100}
        height={100}
        className={cn("hidden h-4 w-fit dark:block", className)}
      />
    </>
  );
}
