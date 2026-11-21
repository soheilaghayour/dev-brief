import { FeedSkeleton } from '@/components/feed/FeedSkeleton';
import { Skeleton } from '@/components/ui/Skeleton';
import { CollectionsSidebarSkeleton } from './CollectionsSidebarSkeleton';

/** The board's frame with its sidebar column and heading row held, so the real board takes their place without a shift. */
export function BoardSkeleton() {
  return (
    <div className="flex flex-col gap-6 md:flex-row">
      <CollectionsSidebarSkeleton />
      <div className="min-w-0 flex-1">
        <div className="flex h-7 items-center">
          <Skeleton className="h-5 w-48" />
        </div>
        <div className="mt-4">
          <FeedSkeleton />
        </div>
      </div>
    </div>
  );
}
