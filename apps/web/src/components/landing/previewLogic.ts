import type { TagSlug } from '@devbrief/shared';

/** The chips above the preview's list; `all` shows every tag. */
export const PREVIEW_TAGS = [
  'all',
  'react',
  'rust',
  'ai-llms',
  'typescript',
  'databases',
] as const satisfies readonly ('all' | TagSlug)[];

export type PreviewTag = (typeof PREVIEW_TAGS)[number];

/** Every story of the pool that carries the tag, in the pool's (rank) order. */
export function visibleStories<Story extends { tags: readonly TagSlug[] }>(
  pool: readonly Story[],
  tag: PreviewTag,
) {
  return tag === 'all' ? pool : pool.filter((story) => story.tags.includes(tag));
}

/** The story page a preview card opens; a sample story (`sample-N`) has none, so its card opens the feed. */
export function storyHref(storyId: string) {
  return storyId.startsWith('sample-') ? '/feed' : `/story/${encodeURIComponent(storyId)}`;
}
