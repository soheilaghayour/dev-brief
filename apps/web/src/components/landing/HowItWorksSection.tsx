import { RANKING_FORMULA_URL } from './landingLinks';
import { SectionHeading } from './SectionHeading';

const STEPS = [
  {
    title: 'Ingest hourly',
    text: 'Hacker News, Dev.to and engineering blogs are fetched every hour. One failing source never stops the rest.',
  },
  {
    title: 'Dedupe and tag',
    text: 'Canonical URLs and titles merge cross-posts into one story, tagged by technology from a fixed taxonomy.',
  },
  {
    title: 'Rank fairly',
    text: 'Engagement is compared within each source over 7 days, so 300 HN points and 300 Dev.to reactions meet on one scale.',
    link: { href: RANKING_FORMULA_URL, label: 'See the formula' },
  },
];

export function HowItWorksSection() {
  return (
    <section aria-labelledby="how-title" className="border-y bg-muted/30">
      <div className="mx-auto max-w-6xl px-4 py-20">
        <SectionHeading
          id="how-title"
          eyebrow="How it works"
          title="Three steps from firehose to feed"
        />
        <ol className="relative grid gap-8 md:grid-cols-3">
          <div
            aria-hidden="true"
            className="via-border absolute top-4 right-[16%] left-[16%] hidden h-px bg-gradient-to-r from-transparent to-transparent md:block"
          />
          {STEPS.map((step, index) => (
            <li key={step.title} className="relative text-center">
              <span className="bg-background text-foreground relative mx-auto flex size-8 items-center justify-center rounded-full border font-mono text-sm">
                {index + 1}
              </span>
              <h3 className="mt-4 text-lg font-semibold tracking-tight">{step.title}</h3>
              <p className="text-muted-foreground mt-2 text-base">{step.text}</p>
              {step.link && (
                <a
                  href={step.link.href}
                  className="text-foreground mt-3 inline-block rounded-sm text-sm font-medium underline underline-offset-4"
                >
                  {step.link.label}
                </a>
              )}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
