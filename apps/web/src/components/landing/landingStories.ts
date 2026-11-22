import type { StoryCard } from '@devbrief/shared';
import type { CardStory } from '@/components/feed/StoryCard';
import type { Features } from '@/config/features';

export const PREVIEW_POOL_MAX = 30;
const WINDOW_MS = 24 * 3_600_000;

/** The sample fixture: a story's age instead of a date, so sample stories always look fresh. */
export type FixtureStory = Omit<CardStory, 'publishedAt'> & { ageMinutes: number };

/** Keeps the stories published within 24 h of `now`, in their given (rank) order, up to the preview's pool size. */
export function selectRecentStories<Story extends Pick<StoryCard, 'publishedAt'>>(
  stories: readonly Story[],
  now: Date,
) {
  const cutoff = now.getTime() - WINDOW_MS;
  return stories
    .filter((story) => new Date(story.publishedAt).getTime() >= cutoff)
    .slice(0, PREVIEW_POOL_MAX);
}

/** Turns fixture entries into cards dated relative to `now`. */
export function fixtureStories(stories: readonly FixtureStory[], now: Date): CardStory[] {
  return stories.map(({ ageMinutes, ...story }) => ({
    ...story,
    publishedAt: new Date(now.getTime() - ageMinutes * 60_000).toISOString(),
  }));
}

/** Copies only what the preview's cards render under these flags, so nothing else crosses into the client island's payload. `url` and `readingTimeMinutes` stay because `StoryCard`'s type needs them for the feed's title link and non-compact row; the preview shows neither. */
export function toPreviewStory(story: CardStory, features: Features): CardStory {
  const { id, title, url, domain, publishedAt, tags, readingTimeMinutes, sources } = story;
  return {
    id,
    title,
    url,
    domain,
    publishedAt,
    tags,
    readingTimeMinutes,
    sources,
    // The fixture carries every field; the live API already omits them while a flag is off.
    ...(features.clusters && story.cluster && { cluster: story.cluster }),
    ...(features.summaries && {
      hasSummary: story.hasSummary ?? false,
      summaryLine: story.summaryLine ?? null,
    }),
  };
}

/** "312 stories today · 12 sources", with singular forms. */
export function formatCounts(storiesToday: number, sourceCount: number) {
  const numbers = new Intl.NumberFormat('en');
  const stories = storiesToday === 1 ? 'story' : 'stories';
  const sources = sourceCount === 1 ? 'source' : 'sources';
  return `${numbers.format(storiesToday)} ${stories} today · ${numbers.format(sourceCount)} ${sources}`;
}
