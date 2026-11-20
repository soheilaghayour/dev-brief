import { MessageSquareIcon } from 'lucide-react';
import type { SourceRef } from '@devbrief/shared';
import type { ComponentType } from 'react';
import type { PreferenceMenuProps } from '@/components/preferences/PreferenceMenu';
import { Badge } from '@/components/ui/Badge';
import { isFeatureEnabled } from '@/config/features';
import { formatCompactCount } from '@/lib/format/formatCompactCount';
import type { PreferenceKind } from '@/lib/guest/preferences';

type SourceBadgeProps = {
  source: Pick<SourceRef, 'kind' | 'slug' | 'name' | 'points' | 'comments' | 'reactions' | 'stars'>;
  /** The Follow / Mute menu the badge opens; passed in, so pages without one (the landing preview) don't load it. */
  menu?: ComponentType<PreferenceMenuProps<PreferenceKind>>;
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
export function SourceBadge({ source, menu: Menu }: SourceBadgeProps) {
  const content = <SourceBadgeContent source={source} />;
  if (!Menu || !isFeatureEnabled('preferences')) {
    return (
      <Badge variant="outline" data-source-kind={source.kind}>
        {content}
      </Badge>
    );
  }
  return (
    <Menu
      kind="source"
      value={source.slug}
      label={source.name}
      variant="outline"
      data={{ 'data-source-kind': source.kind }}
    >
      {content}
    </Menu>
  );
}
