import { MinusIcon, ThumbsDownIcon, ThumbsUpIcon } from 'lucide-react';
import type { ComponentType } from 'react';
import type { StorySummary } from '@devbrief/shared';
import { Badge } from '@/components/ui/Badge';

type Verdict = NonNullable<StorySummary['consensus']>['verdict'];

// Colour never carries the verdict alone: each one has an icon and a text label.
const VERDICTS = {
  mostly_positive: { label: 'Mostly positive', Icon: ThumbsUpIcon },
  mixed: { label: 'Mixed', Icon: MinusIcon },
  mostly_negative: { label: 'Mostly negative', Icon: ThumbsDownIcon },
} as const satisfies Record<Verdict, { label: string; Icon: ComponentType<{ className?: string }> }>;

export type ConsensusCalloutProps = {
  /** What the community is weighing; the heading reads "Community consensus" without one. */
  topic?: string;
  verdict: Verdict;
  pros: string[];
  cons: string[];
  openQuestions?: string[];
};

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

/** The community's verdict with its pros and cons, as plain text nodes. */
export function ConsensusCallout({
  topic,
  verdict,
  pros,
  cons,
  openQuestions = [],
}: ConsensusCalloutProps) {
  const { label, Icon } = VERDICTS[verdict];
  return (
    <div className="bg-muted/50 flex flex-col gap-2 rounded-md border p-3">
      <p className="text-sm font-medium">
        {topic ?? 'Community consensus'}{' '}
        <Badge variant="outline">
          <Icon className="size-3" aria-hidden="true" />
          {label}
        </Badge>
      </p>
      <PointList title="Pros" points={pros} />
      <PointList title="Cons" points={cons} />
      <PointList title="Open questions" points={openQuestions} />
    </div>
  );
}
