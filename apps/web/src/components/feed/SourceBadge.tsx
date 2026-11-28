import { MessageSquareIcon } from 'lucide-react';
import type { SourceRef } from '@devbrief/shared';
import { Badge } from '@/components/ui/Badge';
import { formatCompactCount } from '@/lib/format/formatCompactCount';

type SourceBadgeProps = {
  source: Pick<SourceRef, 'kind' | 'slug' | 'name' | 'points' | 'comments' | 'reactions' | 'stars'>;
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

function Stars({ count }: { count: number }) {
  const full = `${count.toLocaleString('en')} stars`;
  return (
    <span className="inline-flex gap-0.5" title={full}>
      <span aria-hidden="true">★</span>
      <span className="tabular-nums" aria-hidden="true">
        {formatCompactCount(count)}
      </span>
      <span className="sr-only">{full}</span>
    </span>
  );
}

function SourceBadgeContent({ source }: Pick<SourceBadgeProps, 'source'>) {
  if (source.kind === 'hn' || source.kind === 'devto') {
    const score = source.kind === 'hn' ? source.points : source.reactions;
    return (
      <>
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
      </>
    );
  }
  return (
    <>
      <span className="text-foreground font-medium">{source.name}</span>
      {source.stars !== null && <Stars count={source.stars} />}
    </>
  );
}

/** One source of a story: HN `▲ 320 · 141`, Dev.to `♥ 95 · 12`, GitHub `★ 1.2k`, a blog by its name. */
export function SourceBadge({ source }: SourceBadgeProps) {
  return (
    <Badge variant="outline" data-source-kind={source.kind}>
      <SourceBadgeContent source={source} />
    </Badge>
  );
}
