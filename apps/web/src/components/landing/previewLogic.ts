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

/** The card j or k moves to, staying inside the list; other keys leave it where it is. */
export function moveActiveIndex(current: number, key: string, count: number) {
  if (key === 'j') return Math.min(current + 1, Math.max(count - 1, 0));
  if (key === 'k') return Math.max(current - 1, 0);
  return current;
}

/** The story page a preview card opens. */
export function storyHref(storyId: string) {
  return `/story/${encodeURIComponent(storyId)}`;
}

type ScrollFrame = { scrollTop: number; height: number };
/** A card's box in the frame's content coordinates (0 is the top of the list, not of the visible part). */
type FrameBox = { top: number; height: number };

/** The frame's scrollTop that shows the whole card (its top, if it is taller than the frame), moving as little as possible. */
export function scrollTopToReveal(frame: ScrollFrame, card: FrameBox) {
  if (card.top < frame.scrollTop || card.height > frame.height) return card.top;
  const cardBottom = card.top + card.height;
  if (cardBottom > frame.scrollTop + frame.height) return cardBottom - frame.height;
  return frame.scrollTop;
}
