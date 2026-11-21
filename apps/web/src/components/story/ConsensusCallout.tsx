import { MinusIcon, ThumbsDownIcon, ThumbsUpIcon } from 'lucide-react';
import type { ComponentType } from 'react';
import type { StorySummary } from '@devbrief/shared';
import { Badge } from '@/components/ui/Badge';

type Verdict = NonNullable<StorySummary['consensus']>['verdict'];

// Colour never carries the verdict alone: each one has an icon and a text label. The text stays
// `text-foreground` (a tint of the role colour behind it), so contrast holds in light and dark.
const VERDICTS = {
  mostly_positive: {
    label: 'Mostly positive',
    Icon: ThumbsUpIcon,
    tone: 'border-success bg-success/15 text-foreground',
  },
  mixed: { label: 'Mixed', Icon: MinusIcon, tone: 'border-warning bg-warning/15 text-foreground' },
  mostly_negative: {
    label: 'Mostly negative',
    Icon: ThumbsDownIcon,
    tone: 'border-destructive bg-destructive/15 text-foreground',
  },
} as const satisfies Record<
  Verdict,
  { label: string; Icon: ComponentType<{ className?: string }>; tone: string }
>;

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
      <h4 className="text-muted-foreground text-xs font-medium">{title}</h4>
      <ul className="list-disc pl-5 text-sm">
        {points.map((point, index) => (
          // Points are model text and may repeat, so the position is part of the key.
          <li key={`${index}:${point}`}>{point}</li>
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
  const { label, Icon, tone } = VERDICTS[verdict];
  return (
    <div className="bg-muted/50 flex flex-col gap-2 rounded-md border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-medium">{topic ?? 'Community consensus'}</h3>
        <Badge variant="outline" className={tone}>
          <Icon className="size-3" aria-hidden="true" />
          {label}
        </Badge>
      </div>
      <PointList title="Pros" points={pros} />
      <PointList title="Cons" points={cons} />
      <PointList title="Open questions" points={openQuestions} />
    </div>
  );
}
