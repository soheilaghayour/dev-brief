import type { FeedPage, StoryCard } from '@devbrief/shared';

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

/** The id of the card `j` (+1) or `k` (-1) moves to; with no active card both land on the first. */
export function moveActiveId(stories: readonly StoryCard[], activeId: string | null, step: 1 | -1) {
  const current = stories.findIndex((story) => story.id === activeId);
  if (current === -1) return stories[0]?.id ?? null;
  return stories[Math.min(Math.max(current + step, 0), stories.length - 1)]?.id ?? null;
}

/** The URL `c` opens: the first Hacker News or Dev.to item of the story. */
export function discussionUrl(story: StoryCard) {
  return story.sources.find(({ kind }) => kind === 'hn' || kind === 'devto')?.itemUrl ?? null;
}

/** `focus` only counts when that story is on the first page. */
export function focusableId(focus: string | null, firstPage: FeedPage | undefined) {
  if (!focus || !firstPage) return null;
  return firstPage.items.some((story) => story.id === focus) ? focus : null;
}

/** Enter on a focused link, button or menu item already activates it, so the shortcut must not open a second tab. */
export function isEnterOnInteractiveElement(key: string, target: EventTarget | null) {
  return (
    key === 'Enter' &&
    target instanceof Element &&
    target.closest('a, button, [role^="menuitem"]') !== null
  );
}

/** Only http(s) URLs may be opened from a shortcut; React blocks `javascript:` in hrefs but not in `window.open`. */
export function isHttpUrl(url: string) {
  return /^https?:\/\//i.test(url);
}
