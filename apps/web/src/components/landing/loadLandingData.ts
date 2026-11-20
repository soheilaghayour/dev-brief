import { PHASE_PRODUCTION_BUILD } from 'next/constants';
import type { Stats, StoryCard } from '@devbrief/shared';
import fixture from '@/content/landing-fixture.json';
import { getFeed, getStats } from '@/lib/api/endpoints';
import { PREVIEW_VISIBLE } from './previewLogic';
import { fixtureStories, selectRecentStories, type FixtureStory } from './landingStories';

/** Live data, or the committed sample when the API is unreachable or has too few fresh stories. */
export type LandingData = {
  stories: StoryCard[];
  stats: Stats | null;
  isSample: boolean;
  /** When this page was generated; ISR keeps it fixed until the next revalidation. */
  renderedAt: string;
};

function sampleData(now: Date): LandingData {
  const { storiesToday, sourceCount } = fixture;
  return {
    stories: fixtureStories(fixture.items as FixtureStory[], now),
    stats: { storiesToday, sourceCount, lastIngestedAt: now.toISOString() },
    isSample: true,
    renderedAt: now.toISOString(),
  };
}

// The sample only fills a build or dev page; a failed revalidation throws so ISR keeps serving the last good page.
function fallbackData(now: Date) {
  const isBuildOrDev =
    process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD || process.env.NODE_ENV !== 'production';
  if (!isBuildOrDev)
    throw new Error('The API returned too few recent stories for the landing page.');
  return sampleData(now);
}

/** Fetches the preview's stories and the hero counts at build or revalidate time. */
export async function loadLandingData(): Promise<LandingData> {
  const now = new Date();
  // Top covers 7 days, so a wide page is fetched and cut to the last 24 h here.
  const [feed, stats] = await Promise.allSettled([
    getFeed({ sort: 'top', limit: 50 }, { isPerRequest: false }),
    getStats(),
  ]);
  const stories = feed.status === 'fulfilled' ? selectRecentStories(feed.value.items, now) : [];
  if (stories.length < PREVIEW_VISIBLE) return fallbackData(now);
  return {
    stories,
    stats: stats.status === 'fulfilled' ? stats.value : null,
    isSample: false,
    renderedAt: now.toISOString(),
  };
}
