import type { StorySummary } from '@devbrief/shared';
import { Badge } from '@/components/ui/Badge';

const VERDICT_LABELS = {
  mostly_positive: 'Mostly positive',
  mixed: 'Mixed',
  mostly_negative: 'Mostly negative',
} as const satisfies Record<NonNullable<StorySummary['consensus']>['verdict'], string>;

function TldrList({ tldr }: { tldr: StorySummary['tldr'] }) {
  return (
    <ul className="list-disc space-y-1.5 pl-5 leading-relaxed">
      {tldr.map((bullet) => (
        <li key={bullet}>{bullet}</li>
      ))}
    </ul>
  );
}

function PointList({ title, points }: { title: string; points: string[] }) {
  if (points.length === 0) return null;
  return (
    <div>
      <h3 className="text-muted-foreground text-xs font-medium">{title}</h3>
      <ul className="list-disc pl-5 text-sm">
        {points.map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>
    </div>
  );
}

function ConsensusCallout({ consensus }: { consensus: StorySummary['consensus'] }) {
  if (!consensus) {
    return <p className="text-muted-foreground text-sm">Not enough discussion yet</p>;
  }
  return (
    <div className="bg-muted/50 flex flex-col gap-2 rounded-md border p-3">
      <p className="text-sm font-medium">
        Community consensus <Badge variant="outline">{VERDICT_LABELS[consensus.verdict]}</Badge>
      </p>
      <PointList title="Pros" points={consensus.pros} />
      <PointList title="Cons" points={consensus.cons} />
    </div>
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
      <ConsensusCallout consensus={summary.consensus} />
    </section>
  );
}
