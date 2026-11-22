import { PHASE_PRODUCTION_BUILD } from 'next/constants';
import type { Stats } from '@devbrief/shared';
import type { CardStory } from '@/components/feed/StoryCard';
import fixture from '@/content/landing-fixture.json';
import { FEATURES, type Features } from '@/config/features';
import { ApiError } from '@/lib/api/apiError';
import { getExampleBriefings, getFeed, getStats } from '@/lib/api/endpoints';
import { sampleExampleBriefings, type ExampleBriefing } from './exampleBriefingData';
import {
  fixtureStories,
  selectRecentStories,
  toPreviewStory,
  type FixtureStory,
} from './landingStories';

/** Fewer fresh stories than this and the page falls back to the sample fixture (AC-L1). */
export const PREVIEW_MIN_STORIES = 6;

/** Live data, or the committed sample when the API is unreachable or has too few fresh stories. */
export type LandingData = {
  /** The preview's stories, cut to the fields its cards render. */
  stories: CardStory[];
  stats: Stats | null;
  isSample: boolean;
  /** When this page was generated; ISR keeps it fixed until the next revalidation. */
  renderedAt: string;
  /** The stored example briefings; empty while the copilot flag is off. */
  examples: ExampleBriefing[];
  examplesAreSample: boolean;
};

type PreviewData = Omit<LandingData, 'examples' | 'examplesAreSample'>;

function sampleData(now: Date): PreviewData {
  const { storiesToday, sourceCount } = fixture;
  return {
    stories: fixtureStories(fixture.items as FixtureStory[], now),
    stats: { storiesToday, sourceCount, lastIngestedAt: now.toISOString() },
    isSample: true,
    renderedAt: now.toISOString(),
  };
}

// The sample only fills a build or dev page; a failed revalidation throws so ISR keeps serving the last good page.
function isBuildOrDev() {
  return process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD || process.env.NODE_ENV !== 'production';
}

function fallbackData(now: Date) {
  if (!isBuildOrDev())
    throw new Error('The API returned too few recent stories for the landing page.');
  return sampleData(now);
}

type ExamplesResult = Awaited<ReturnType<typeof getExampleBriefings>>;

// An answer of "none" (an empty list or any HTTP error, such as 404 FEATURE_DISABLED from an API with the copilot off) fills the sample at any time; an unreachable or unparseable answer does so only at build, so a failed revalidation keeps the last good page.
function resolveExamples(result: PromiseSettledResult<ExamplesResult | null>, features: Features) {
  if (!features.copilot) return { examples: [], examplesAreSample: false };
  if (result.status === 'fulfilled' && result.value && result.value.items.length > 0)
    return { examples: result.value.items, examplesAreSample: false };
  if (result.status === 'rejected' && !(result.reason instanceof ApiError) && !isBuildOrDev())
    throw new Error('The API did not return the example briefings for the landing page.');
  return { examples: sampleExampleBriefings(), examplesAreSample: true };
}

/** Fetches the preview's stories and the hero counts at build or revalidate time. */
export async function loadLandingData(features: Features = FEATURES): Promise<LandingData> {
  const now = new Date();
  // Top covers 7 days, so a wide page is fetched and cut to the last 24 h here.
  const [feed, stats, examples] = await Promise.allSettled([
    getFeed({ sort: 'top', limit: 50 }, { isPerRequest: false }),
    getStats(),
    features.copilot ? getExampleBriefings() : Promise.resolve(null),
  ]);
  const stories = feed.status === 'fulfilled' ? selectRecentStories(feed.value.items, now) : [];
  const preview: PreviewData =
    stories.length < PREVIEW_MIN_STORIES
      ? fallbackData(now)
      : {
          stories,
          stats: stats.status === 'fulfilled' ? stats.value : null,
          isSample: false,
          renderedAt: now.toISOString(),
        };
  return {
    ...preview,
    stories: preview.stories.map((story) => toPreviewStory(story, features)),
    ...resolveExamples(examples, features),
  };
}
