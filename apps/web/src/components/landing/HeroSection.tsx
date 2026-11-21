import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { HeroPreview } from './HeroPreview';
import { SIGN_IN_PATH } from './landingLinks';
import type { LandingData } from './loadLandingData';
import { StatsPill } from './StatsPill';

type HeroSectionProps = { data: LandingData; host: string };

export function HeroSection({ data, host }: HeroSectionProps) {
  const { stories, stats, isSample, renderedAt } = data;
  return (
    <section aria-labelledby="hero-title" className="relative isolate overflow-hidden">
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 -z-10 h-[36rem] bg-[radial-gradient(60%_60%_at_50%_0%,color-mix(in_oklab,var(--primary)_24%,transparent),transparent)]"
      />
      <div className="mx-auto max-w-6xl px-4 pt-16 pb-16 text-center md:pt-24">
        <StatsPill stats={stats} renderedAt={renderedAt} />
        <h1
          id="hero-title"
          className="mx-auto mt-6 max-w-3xl text-4xl font-semibold tracking-tight text-balance md:text-6xl"
        >
          Your morning scan in 5 min
        </h1>
        <p className="text-muted-foreground mx-auto mt-5 max-w-2xl text-base text-balance md:text-lg">
          DevBrief pulls Hacker News, Dev.to and GitHub every hour, merges duplicates, tags by
          technology and ranks everything on one fair scale. No account needed.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button asChild size="lg" className="max-sm:w-full">
            <Link href="/feed">Explore the feed — no login required</Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="max-sm:w-full">
            <Link href={SIGN_IN_PATH}>Sign in with GitHub</Link>
          </Button>
        </div>
        <div className="mx-auto mt-14 max-w-3xl">
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
