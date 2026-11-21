import Link from 'next/link';
import type { StoryCard, StoryDetail } from '@devbrief/shared';
import { SourceBadge } from '@/components/feed/SourceBadge';
import { SOURCE_KIND_LABELS } from '@/components/feed/sourceKinds';
import { Badge } from '@/components/ui/Badge';
import { groupClusterStories } from './groupClusterStories';

function MemberRow({ story, isCurrent }: { story: StoryCard; isCurrent: boolean }) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5">
      {isCurrent ? (
        <span aria-current="page" className="font-medium">
          {story.title}
        </span>
      ) : (
        <Link href={`/story/${story.id}`} className="rounded-sm hover:underline">
          {story.title}
        </Link>
      )}
      {isCurrent && <Badge variant="secondary">This story</Badge>}
      {story.sources.map((source) => (
        <SourceBadge key={`${source.slug}:${source.itemUrl}`} source={source} />
      ))}
    </li>
  );
}

/** Every story of the cluster the page's story belongs to, grouped by source kind, the page's own marked. */
export function ClusterMembers({ story }: { story: StoryDetail }) {
  if (!story.clusterMembers) return null;
  const groups = groupClusterStories([story, ...story.clusterMembers]);
  return (
    <section aria-labelledby="related-coverage" className="max-w-3xl">
      <h2
        id="related-coverage"
        className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase"
      >
        Related coverage
      </h2>
      <div className="flex flex-col gap-3">
        {groups.map((group) => (
          <div key={group.kind}>
            <h3 className="mb-1 text-sm font-medium">{SOURCE_KIND_LABELS[group.kind]}</h3>
            <ul className="divide-y rounded-lg border">
              {group.stories.map((member) => (
                <MemberRow key={member.id} story={member} isCurrent={member.id === story.id} />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
