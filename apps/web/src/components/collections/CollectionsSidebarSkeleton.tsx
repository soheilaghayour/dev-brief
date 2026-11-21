import { Skeleton } from '@/components/ui/Skeleton';

/** Holds the sidebar's column and its heading, "All saved" and "New" rows until the stored collections load, so nothing around it moves. */
export function CollectionsSidebarSkeleton() {
  return (
    <div aria-hidden="true" className="grid content-start gap-1 md:w-56 md:shrink-0">
      <div className="flex h-4 items-center px-2">
        <Skeleton className="h-3 w-20" />
      </div>
      <div className="grid gap-0.5">
        <div className="flex h-8 items-center px-2">
          <Skeleton className="h-4 w-full" />
        </div>
      </div>
      <div className="flex h-8 items-center px-2">
        <Skeleton className="h-4 w-12" />
      </div>
    </div>
  );
}
