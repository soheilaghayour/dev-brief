import type { Metadata } from 'next';
import { ExampleBriefings } from '@/components/landing/ExampleBriefings';
import { FaqSection } from '@/components/landing/FaqSection';
import { FeatureBento } from '@/components/landing/FeatureBento';
import { FinalCtaBand } from '@/components/landing/FinalCtaBand';
import { HeroSection } from '@/components/landing/HeroSection';
import { HowItWorksSection } from '@/components/landing/HowItWorksSection';
import { loadLandingData } from '@/components/landing/loadLandingData';
import { ProblemSection } from '@/components/landing/ProblemSection';
import { SourceStrip } from '@/components/landing/SourceStrip';
import { UnderTheHoodSection } from '@/components/landing/UnderTheHoodSection';
import { loadAppOrigin } from '@/env';

// Static with ISR: the preview's stories are fetched at build and again every 15 minutes.
export const revalidate = 900;

const TITLE = 'DevBrief — Your morning tech scan in 5 minutes';
const DESCRIPTION =
  'DevBrief pulls Hacker News, Dev.to and GitHub every hour, merges duplicates, tags by technology and ranks everything on one fair scale. No account needed.';

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: '/' },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: '/',
    siteName: 'DevBrief',
    type: 'website',
  },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION },
};

export default async function LandingPage() {
  const data = await loadLandingData();
  return (
    <>
      <HeroSection data={data} host={loadAppOrigin().host} />
      <SourceStrip />
      <ProblemSection />
      <HowItWorksSection />
      <FeatureBento />
      <ExampleBriefings examples={data.examples} isSample={data.examplesAreSample} />
      <UnderTheHoodSection />
      <FaqSection />
      <FinalCtaBand />
    </>
  );
}
