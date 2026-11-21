import { Skeleton } from '@/components/ui/Skeleton';

export function RelatedSkeleton() {
  return (
    <div role="status" className="mt-2 flex flex-col gap-2">
      <span className="sr-only">Loading related coverage…</span>
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  );
}
