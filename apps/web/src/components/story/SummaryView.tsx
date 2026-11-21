import type { StorySummary } from '@devbrief/shared';
import { ConsensusCallout } from './ConsensusCallout';

/** Where a summary comes from: the story's original page and the sources that carried it. */
export type SummaryOrigin = { url: string; domain: string; sourceNames: string[] };

function TldrList({ tldr }: { tldr: StorySummary['tldr'] }) {
  return (
    <ul className="list-disc space-y-1.5 pl-5 leading-relaxed">
      {tldr.map((bullet) => (
        <li key={bullet}>{bullet}</li>
      ))}
    </ul>
  );
}

function SummaryConsensus({ consensus }: { consensus: StorySummary['consensus'] }) {
  if (!consensus) {
    return <p className="text-muted-foreground text-sm">Not enough discussion yet</p>;
  }
  return (
    <ConsensusCallout verdict={consensus.verdict} pros={consensus.pros} cons={consensus.cons} />
  );
}

function OriginLink({ origin }: { origin: SummaryOrigin }) {
  return (
    <a
      href={origin.url}
      target="_blank"
      rel="noopener noreferrer"
      className="text-foreground rounded-sm text-sm font-medium underline"
    >
      Read the original on {origin.domain} <span aria-hidden="true">↗</span>
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}

/** A summary as plain text nodes (AC-2.3.6): the model's words are never parsed as HTML or Markdown. */
export function SummaryView({ summary, origin }: { summary: StorySummary; origin: SummaryOrigin }) {
  return (
    <section
      aria-labelledby="ai-summary"
      className="flex max-w-3xl flex-col gap-3 rounded-lg border p-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2
          id="ai-summary"
          className="text-muted-foreground text-xs font-medium tracking-wide uppercase"
        >
          Summary
        </h2>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <p className="text-muted-foreground text-xs">
            AI-generated
            {summary.consensus && <> · based on {summary.consensus.basedOnComments} comments</>}
          </p>
          <OriginLink origin={origin} />
        </div>
      </div>
      <TldrList tldr={summary.tldr} />
      <SummaryConsensus consensus={summary.consensus} />
      <p className="text-muted-foreground text-xs">Source: {origin.sourceNames.join(', ')}</p>
    </section>
  );
}
