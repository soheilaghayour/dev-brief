import type { StoryDetail } from '@devbrief/shared';
import { RelativeTime } from '@/components/feed/RelativeTime';
import { SourceBadge } from '@/components/feed/SourceBadge';
import { LazyPreferenceMenu } from '@/components/preferences/LazyPreferenceMenu';

/** Every SourceItem behind the story: where it ran, by whom, its numbers and a link to the thread. */
export function SourceItemList({ items }: { items: StoryDetail['items'] }) {
  return (
    <section aria-labelledby="discussed-on" className="max-w-3xl">
      <h2
        id="discussed-on"
        className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase"
      >
        Discussed on
      </h2>
      <ul className="divide-y rounded-lg border">
        {items.map((item) => (
          <li
            key={`${item.slug}:${item.itemUrl}`}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5"
          >
            <SourceBadge source={item} menu={LazyPreferenceMenu} />
            <span className="text-muted-foreground text-xs">
              {item.author && <>by {item.author} · </>}
              <RelativeTime iso={item.publishedAt} style="long" />
            </span>
            <a
              href={item.itemUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary ml-auto rounded-sm text-xs hover:underline"
            >
              {item.kind === 'hn' || item.kind === 'devto' ? 'Discussion' : 'Article'} →
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
