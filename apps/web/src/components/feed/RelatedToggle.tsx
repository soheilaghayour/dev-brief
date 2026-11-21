'use client';

import { lazy, Suspense, useId, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { RelatedSkeleton } from './RelatedSkeleton';

// The list, its query and the schema parse are fetched on the first expand, keeping them out of first-load JS.
const RelatedMembers = lazy(() =>
  import('./RelatedMembers').then((module) => ({ default: module.RelatedMembers })),
);

export type RelatedToggleProps = {
  clusterId: string;
  memberCount: number;
};

/** The "+N related" control of a cluster card: expands the other members inline. */
export function RelatedToggle({ clusterId, memberCount }: RelatedToggleProps) {
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
        {isExpanded && (
          <Suspense fallback={<RelatedSkeleton />}>
            <RelatedMembers clusterId={clusterId} />
          </Suspense>
        )}
      </div>
    </div>
  );
}
