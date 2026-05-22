import { Skeleton } from "@/components/ui/skeleton";

function JobCardSkeleton() {
  return (
    <div className="rounded-lg border p-4 flex items-start justify-between gap-4">
      <div className="flex-1 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
        <Skeleton className="h-4 w-32" />
      </div>
      <Skeleton className="h-7 w-14 shrink-0" />
    </div>
  );
}

export function JobListSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: 4 }).map((_, i) => {
        // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton list, items never reorder
        return <JobCardSkeleton key={i} />;
      })}
    </div>
  );
}
