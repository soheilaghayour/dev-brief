import Link from 'next/link';
import type { ClusterDetail } from '@devbrief/shared';
import { SourceBadge } from './SourceBadge';

type RelatedMembersProps = {
  cluster: ClusterDetail;
  /** The card's own story, left out: a stale card for a former representative must not list itself. */
  storyId: string;
};

/** The other stories of a cluster, as the list under an expanded card. */
export function RelatedMembers({ cluster, storyId }: RelatedMembersProps) {
  const others = [cluster.representative, ...cluster.members].filter(({ id }) => id !== storyId);
  return (
    <ul className="mt-2 flex flex-col gap-2 border-l-2 pl-3">
      {others.map((member) => (
        <li key={member.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <Link href={`/story/${member.id}`} className="text-foreground rounded-sm hover:underline">
            {member.title}
          </Link>
          {member.sources.map((source) => (
            <SourceBadge key={`${source.slug}:${source.itemUrl}`} source={source} />
          ))}
        </li>
      ))}
    </ul>
  );
}
