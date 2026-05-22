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
    <div className="p-8 max-w-2xl mx-auto">
      {/* Title */}
      <Skeleton className="h-8 w-24 mb-6" />

      {/* Tabs list */}
      <div className="flex gap-1 h-8 mb-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-full w-24 rounded-md" />
        ))}
      </div>

      {/* Personal tab fields */}
      <div className="flex flex-col gap-4 mt-4">
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
