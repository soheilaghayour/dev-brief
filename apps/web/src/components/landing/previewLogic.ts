import type { StoryCard, TagSlug } from '@devbrief/shared';

export const PREVIEW_VISIBLE = 6;

/** The chips above the preview's list; `all` shows every tag. */
export const PREVIEW_TAGS = [
  'all',
  'react',
  'typescript',
  'ai-llms',
  'system-design',
  'databases',
] as const satisfies readonly ('all' | TagSlug)[];

export type PreviewTag = (typeof PREVIEW_TAGS)[number];

/** The first stories of the pool that carry the tag, as many as the window shows. */
export function visibleStories(pool: readonly StoryCard[], tag: PreviewTag) {
  const matching = tag === 'all' ? pool : pool.filter((story) => story.tags.includes(tag));
  return matching.slice(0, PREVIEW_VISIBLE);
}

/** The card j or k moves to, staying inside the list; other keys leave it where it is. */
export function moveActiveIndex(current: number, key: string, count: number) {
  if (key === 'j') return Math.min(current + 1, Math.max(count - 1, 0));
  if (key === 'k') return Math.max(current - 1, 0);
  return current;
}

/** The feed URL that opens a story with its card focused. */
export function feedFocusHref(storyId: string) {
  return `/feed?focus=${encodeURIComponent(storyId)}`;
}
