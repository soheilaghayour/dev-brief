import { Skeleton } from '@/components/ui/Skeleton';

/** The placeholder of a briefing whose `root` has not arrived: a title line, then card-shaped blocks. */
export function BriefingSkeleton() {
  return (
    <div role="status" aria-label="Preparing your briefing" className="flex flex-col gap-4">
      <Skeleton className="h-7 w-2/3" />
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-24" />
      <Skeleton className="h-24" />
    </div>
  );
}
