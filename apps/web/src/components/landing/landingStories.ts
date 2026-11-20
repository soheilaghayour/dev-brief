import type { StoryCard } from '@devbrief/shared';

export const PREVIEW_POOL_MAX = 30;
const WINDOW_MS = 24 * 3_600_000;

/** The sample fixture: a story's age instead of a date, so sample stories always look fresh. */
export type FixtureStory = Omit<StoryCard, 'publishedAt' | 'excerpt' | 'author' | 'rankScore'> & {
  ageMinutes: number;
};

/** Keeps the stories published within 24 h of `now`, in their given (rank) order, up to the preview's pool size. */
export function selectRecentStories(stories: readonly StoryCard[], now: Date) {
  const cutoff = now.getTime() - WINDOW_MS;
  return stories
    .filter((story) => new Date(story.publishedAt).getTime() >= cutoff)
    .slice(0, PREVIEW_POOL_MAX);
}

/** Turns fixture entries into cards dated relative to `now`. */
export function fixtureStories(stories: readonly FixtureStory[], now: Date): StoryCard[] {
  return stories.map(({ ageMinutes, ...story }, index) => ({
    ...story,
    excerpt: null,
    author: null,
    publishedAt: new Date(now.getTime() - ageMinutes * 60_000).toISOString(),
    rankScore: stories.length - index,
  }));
}

/** "312 stories today · 12 sources", with singular forms. */
export function formatCounts(storiesToday: number, sourceCount: number) {
  const numbers = new Intl.NumberFormat('en');
  const stories = storiesToday === 1 ? 'story' : 'stories';
  const sources = sourceCount === 1 ? 'source' : 'sources';
  return `${numbers.format(storiesToday)} ${stories} today · ${numbers.format(sourceCount)} ${sources}`;
}
