import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { isFeatureEnabled } from '@/config/features';
import { HeroPreview } from './HeroPreview';
import { SIGN_IN_PATH } from './landingLinks';
import type { LandingData } from './loadLandingData';
import { StatsPill } from './StatsPill';

// Each variant claims only the dedup that is live: URLs alone, or clusters too (PRD §1.5 principle 5).
const DEDUP_SENTENCE = {
  url: "The same link on Hacker News, Dev.to and GitHub becomes one card, with every source's points and comments side by side.",
  clusters:
    'The same story on Hacker News, Dev.to and GitHub becomes one card, even when each links somewhere else.',
};
const PULL_SENTENCE =
  'DevBrief pulls them all every hour and ranks everything on one fair scale, no account needed.';

/** The two sentences under the H1, in the variant the clusters flag allows. */
function dedupSentences() {
  const dedup = isFeatureEnabled('clusters') ? DEDUP_SENTENCE.clusters : DEDUP_SENTENCE.url;
  return `${dedup} ${PULL_SENTENCE}`;
}

type HeroSectionProps = { data: LandingData; host: string };

export function HeroSection({ data, host }: HeroSectionProps) {
  const { stories, stats, isSample, renderedAt } = data;
  return (
    <section aria-labelledby="hero-title">
      {/* min-w-0 and minmax(0, …) let a long title or URL shrink inside its column, on one column and on two, instead of widening the page. */}
      <div className="mx-auto grid max-w-6xl gap-12 px-4 pt-16 pb-16 md:grid-cols-[minmax(0,45fr)_minmax(0,55fr)] md:items-center md:gap-10 md:pt-24">
        <div data-hero-column="text" className="min-w-0 text-left">
          <StatsPill stats={stats} renderedAt={renderedAt} />
          <h1
            id="hero-title"
            className="mt-6 text-4xl font-semibold tracking-tight text-balance lg:text-5xl"
          >
            Your morning tech scan in 5 minutes
          </h1>
          <p className="text-muted-foreground mt-5 text-base md:text-lg">{dedupSentences()}</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Button asChild size="lg" className="max-sm:w-full">
              <Link href="/feed">Explore the feed — no login required</Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="max-sm:w-full">
              <Link href={SIGN_IN_PATH}>Sign in with GitHub</Link>
            </Button>
          </div>
        </div>
        <div data-hero-column="preview" className="min-w-0">
          <HeroPreview
            stories={stories}
            storiesToday={stats?.storiesToday}
            isSample={isSample}
            host={host}
            briefing={data.examples[0]}
            briefingIsSample={data.examplesAreSample}
          />
        </div>
      </div>
    </section>
  );
}
