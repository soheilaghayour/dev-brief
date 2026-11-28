import type { FeedPage } from '@devbrief/shared';

/** All loaded pages as one list; a story that moved between pages while scrolling appears once. */
export function flattenPages(pages: readonly FeedPage[]) {
  const seen = new Set<string>();
  return pages
    .flatMap((page) => page.items)
    .filter((story) => {
      if (seen.has(story.id)) return false;
      seen.add(story.id);
      return true;
    });
}
