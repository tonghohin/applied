"use client";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { Job } from "@/lib/trpc";
import { RiFileTextLine } from "@remixicon/react";

export function JobDescriptionSheet({ job }: { job: Job }) {
  return (
    <Sheet>
      <SheetTrigger
        aria-label="View job description"
        className="shrink-0 text-muted-foreground hover:text-foreground"
      >
        <RiFileTextLine className="size-3.5" />
      </SheetTrigger>
      <SheetContent className="sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{job.title}</SheetTitle>
          <SheetDescription>
            {job.company} · {job.location}
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {job.description ? (
            <p className="wrap-break-word whitespace-pre-wrap text-sm">{job.description}</p>
          ) : (
            <p className="text-muted-foreground text-sm">No description available</p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
