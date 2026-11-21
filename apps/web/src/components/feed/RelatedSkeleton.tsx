import { Skeleton } from '@/components/ui/Skeleton';

export function RelatedSkeleton() {
  return (
    <div role="status" aria-label="Loading related stories" className="mt-2 flex flex-col gap-2">
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  );
}
