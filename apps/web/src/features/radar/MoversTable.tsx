import { useId } from 'react';
import Link from 'next/link';
import { RADAR_TAGS_MAX } from '@devbrief/shared';
import type { Radar, TagSlug } from '@devbrief/shared';
import { TagBadge } from '@/components/feed/TagBadge';
import { Checkbox } from '@/components/ui/Checkbox';

type Mover = Radar['movers'][number];

/** A mover, or a charted tag that left the movers: its previous total is unknown (`null`). */
export type MoverRow = Omit<Mover, 'previous'> & { previous: number | null };

type MoversTableProps = {
  movers: readonly MoverRow[];
  /** The tags drawn in the chart. */
  selected: readonly TagSlug[];
  onToggleTag: (tag: TagSlug) => void;
  /** True while the shown rows belong to the previous query: ticking then would act on stale rows. */
  isStale?: boolean;
};

/** Direction by icon and text, never colour alone; a null delta means the previous window was empty. */
function formatDelta({ previous, deltaPct }: MoverRow) {
  if (previous === null) return { icon: '', text: '–' };
  if (deltaPct === null) return { icon: '▲', text: 'new' };
  if (deltaPct > 0) return { icon: '▲', text: `+${deltaPct}%` };
  if (deltaPct < 0) return { icon: '▼', text: `−${Math.abs(deltaPct)}%` };
  return { icon: '', text: '0%' };
}

/** The "Top movers" table: tag, current and previous window totals, Δ%, and a checkbox that puts the tag in the chart. */
export function MoversTable({ movers, selected, onToggleTag, isStale }: MoversTableProps) {
  const isFull = selected.length >= RADAR_TAGS_MAX;
  const hintId = useId();
  const lastTagId = `${hintId}-last`;

  return (
    <div>
      <table className="w-full text-sm">
        <caption className="sr-only">Top movers</caption>
        <thead>
          <tr className="text-muted-foreground border-b text-left">
            <th scope="col" className="py-2 pr-2 font-medium">
              Tag
            </th>
            <th scope="col" className="px-2 py-2 text-right font-medium">
              Now
            </th>
            <th scope="col" className="px-2 py-2 text-right font-medium">
              Prev
            </th>
            <th scope="col" className="px-2 py-2 text-right font-medium">
              Δ<span className="sr-only"> Change</span>
            </th>
            <th scope="col" className="py-2 pl-2 text-right font-medium">
              Chart
            </th>
          </tr>
        </thead>
        <tbody>
          {movers.map((mover) => {
            const isSelected = selected.includes(mover.tag);
            const delta = formatDelta(mover);
            // The last charted tag stays on, because a chart needs one line.
            const isLastTag = isSelected && selected.length === 1;
            const isDisabled = isStale || isLastTag || (!isSelected && isFull);
            return (
              <tr key={mover.tag} className="border-b last:border-b-0">
                <td className="py-2 pr-2">
                  <Link href={`/feed?tags=${mover.tag}`} className="rounded-sm">
                    <TagBadge slug={mover.tag} />
                  </Link>
                </td>
                <td className="px-2 py-2 text-right tabular-nums">{mover.current}</td>
                <td className="text-muted-foreground px-2 py-2 text-right tabular-nums">
                  {mover.previous ?? '–'}
                </td>
                <td className="px-2 py-2 text-right whitespace-nowrap tabular-nums">
                  <span aria-hidden="true" className="mr-1 text-xs">
                    {delta.icon}
                  </span>
                  {delta.text}
                </td>
                <td className="py-2 pl-2 text-right">
                  <Checkbox
                    aria-label={`Show ${mover.label} in chart`}
                    aria-describedby={
                      isLastTag ? lastTagId : !isSelected && isFull ? hintId : undefined
                    }
                    checked={isSelected}
                    disabled={isDisabled}
                    onChange={() => onToggleTag(mover.tag)}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p id={hintId} aria-live="polite" className="text-muted-foreground mt-2 text-xs">
        {`${selected.length} of ${RADAR_TAGS_MAX} tags charted.`}
        {isFull ? ' Uncheck one to pick another.' : ''}
      </p>
      <p id={lastTagId} className="sr-only">
        At least one tag stays in the chart
      </p>
    </div>
  );
}
