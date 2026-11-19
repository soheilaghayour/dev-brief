import { MessageSquareIcon } from 'lucide-react';
import type { SourceRef } from '@devbrief/shared';
import { Badge } from '@/components/ui/Badge';

type SourceBadgeProps = {
  source: Pick<SourceRef, 'kind' | 'name' | 'points' | 'comments' | 'reactions'>;
};

const SCORE_GLYPH = { hn: '▲', devto: '♥' } as const;

function Count({ value, title }: { value: number | null; title: string }) {
  if (value === null) return null;
  return (
    <span className="tabular-nums" title={title}>
      {value}
    </span>
  );
}

function Comments({ count }: { count: number | null }) {
  if (count === null) return null;
  return (
    <span className="inline-flex items-center gap-0.5 tabular-nums" title="Comments">
      <MessageSquareIcon className="size-3" aria-hidden="true" />
      <span className="sr-only">Comments </span>
      {count}
    </span>
  );
}

/** One source of a story: HN `▲ 320 · 141`, Dev.to `♥ 95 · 12`, a blog by its name. */
export function SourceBadge({ source }: SourceBadgeProps) {
  if (source.kind === 'hn' || source.kind === 'devto') {
    const score = source.kind === 'hn' ? source.points : source.reactions;
    return (
      <Badge variant="outline" data-source-kind={source.kind}>
        <span className="text-foreground font-medium">
          {source.kind === 'hn' ? 'HN' : source.name}
        </span>
        {score !== null && (
          <span className="inline-flex gap-0.5">
            <span aria-hidden="true">{SCORE_GLYPH[source.kind]}</span>
            <Count value={score} title={source.kind === 'hn' ? 'Points' : 'Reactions'} />
          </span>
        )}
        <Comments count={source.comments} />
      </Badge>
    );
  }
  return (
    <Badge variant="outline" data-source-kind={source.kind}>
      <span className="text-foreground font-medium">{source.name}</span>
    </Badge>
  );
}
