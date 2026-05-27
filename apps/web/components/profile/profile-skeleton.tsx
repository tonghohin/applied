import { Skeleton } from "@/components/ui/skeleton";

function FieldSkeleton() {
  return (
    <div className="flex flex-col gap-1.5">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-9 w-full" />
    </div>
  );
}

export function ProfileSkeleton() {
  return (
    <div className="mx-auto max-w-2xl p-8">
      {/* Title */}
      <Skeleton className="mb-6 h-8 w-24" />

      {/* Tabs list */}
      <div className="mb-4 flex h-8 gap-1">
        {Array.from({ length: 5 }).map((_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static array, order never changes
          <Skeleton key={i} className="h-full w-24 rounded-md" />
        ))}
      </div>

      {/* Personal tab fields */}
      <div className="mt-4 flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4">
          <FieldSkeleton />
          <FieldSkeleton />
        </div>
        <FieldSkeleton />
        <FieldSkeleton />
        <FieldSkeleton />
        <FieldSkeleton />
        <FieldSkeleton />
        {/* Save button */}
        <Skeleton className="h-9 w-full" />
      </div>
    </div>
  );
}
