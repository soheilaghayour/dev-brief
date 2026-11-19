import { Skeleton } from '@/components/ui/Skeleton';

const ROW_COUNT = 8;

/** Placeholder rows as tall as a real card with a one-line title, so loading shifts no layout. */
export function FeedSkeleton() {
  return (
    <div role="status" aria-label="Loading stories">
      {Array.from({ length: ROW_COUNT }, (_, index) => (
        <div key={index} className="flex h-[76px] flex-col justify-center gap-2.5 border-b px-3">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3.5 w-1/2" />
        </div>
      ))}
    </div>
  );
}
