import type { StorySummary } from '@devbrief/shared';
import { ConsensusCallout } from './ConsensusCallout';

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

/** A summary as plain text nodes (AC-2.3.6): the model's words are never parsed as HTML or Markdown. */
export function SummaryView({ summary }: { summary: StorySummary }) {
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
        <p className="text-muted-foreground text-xs">
          AI-generated
          {summary.consensus && <> · based on {summary.consensus.basedOnComments} comments</>}
        </p>
      </div>
      <TldrList tldr={summary.tldr} />
      <SummaryConsensus consensus={summary.consensus} />
    </section>
  );
}
