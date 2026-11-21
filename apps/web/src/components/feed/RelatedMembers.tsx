'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { RelatedSkeleton } from './RelatedSkeleton';
import { SourceBadge } from './SourceBadge';

/** The other members of a cluster, fetched on first render; loaded only when a card is expanded. */
export function RelatedMembers({ clusterId }: { clusterId: string }) {
  const query = useQuery({
    queryKey: ['cluster', clusterId],
    queryFn: async () => (await import('@/lib/api/endpoints')).getCluster(clusterId),
    staleTime: 60_000,
  });

  function retry() {
    void query.refetch();
  }

  if (query.isError) {
    return (
      <p role="alert" className="text-muted-foreground mt-2 flex items-center gap-2 text-xs">
        Couldn&apos;t load related stories.
        <Button variant="outline" size="xs" onClick={retry}>
          Try again
        </Button>
      </p>
    );
  }
  if (!query.data) return <RelatedSkeleton />;

  return (
    <ul className="mt-2 flex flex-col gap-2 border-l-2 pl-3">
      {query.data.members.map((member) => (
        <li key={member.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <Link href={`/story/${member.id}`} className="text-foreground rounded-sm hover:underline">
            {member.title}
          </Link>
          {member.sources.map((source) => (
            <SourceBadge key={source.itemUrl} source={source} />
          ))}
        </li>
      ))}
    </ul>
  );
}
