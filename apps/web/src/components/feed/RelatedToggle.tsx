'use client';

import { lazy, Suspense, useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { RelatedSkeleton } from './RelatedSkeleton';

// The list is a separate chunk, loaded on the first expand to keep it out of first-load JS.
const RelatedMembers = lazy(() =>
  import('./RelatedMembers').then((module) => ({ default: module.RelatedMembers })),
);

export type RelatedToggleProps = {
  storyId: string;
  clusterId: string;
  memberCount: number;
};

async function loadCluster(clusterId: string) {
  // Importing the list chunk here too makes a failed chunk load a query error that "Try again" retries: `lazy` caches its rejection.
  const [{ getCluster }] = await Promise.all([
    import('@/lib/api/endpoints'),
    import('./RelatedMembers'),
  ]);
  return getCluster(clusterId);
}

function RelatedPanel({ storyId, clusterId }: Omit<RelatedToggleProps, 'memberCount'>) {
  const query = useQuery({
    queryKey: ['cluster', clusterId],
    queryFn: () => loadCluster(clusterId),
    staleTime: 60_000,
  });

  function retry() {
    void query.refetch();
  }

  if (query.data) {
    return (
      <Suspense fallback={<RelatedSkeleton />}>
        <RelatedMembers cluster={query.data} storyId={storyId} />
      </Suspense>
    );
  }
  // The alert is gone while a retry runs, so a second failure is announced again.
  if (query.isError && !query.isFetching) {
    return (
      <p role="alert" className="text-muted-foreground mt-2 flex items-center gap-2 text-xs">
        Couldn&apos;t load related stories.
        <Button variant="outline" size="xs" onClick={retry}>
          Try again
        </Button>
      </p>
    );
  }
  return <RelatedSkeleton />;
}

/** The "+N related" control of a cluster card: expands the other members inline. */
export function RelatedToggle({ storyId, clusterId, memberCount }: RelatedToggleProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const listId = useId();

  function toggle() {
    setIsExpanded((expanded) => !expanded);
  }

  return (
    <div className="mt-1.5">
      <Button
        variant="ghost"
        size="xs"
        className="text-muted-foreground -ml-2"
        aria-expanded={isExpanded}
        aria-controls={listId}
        onClick={toggle}
      >
        +{memberCount - 1} related <span aria-hidden="true">{isExpanded ? '▴' : '▾'}</span>
      </Button>
      <div id={listId} hidden={!isExpanded}>
        {isExpanded && <RelatedPanel storyId={storyId} clusterId={clusterId} />}
      </div>
    </div>
  );
}
