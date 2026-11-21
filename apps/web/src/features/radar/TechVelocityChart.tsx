'use client';

import { useEffect, useState } from 'react';
import type { ComponentType } from 'react';
import type { Radar } from '@devbrief/shared';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatDay, toChartRows, type VelocitySeries } from './chartRows';
import { seriesStyle } from './seriesStyles';

/** The catalog's `TechVelocityChart` props (PRD §6.4.3), so the copilot adapter passes them straight through. */
export type TechVelocityChartProps = {
  title: string;
  window: Radar['window'];
  metric: Radar['metric'];
  series: VelocitySeries;
};

type LinesState =
  | { status: 'loading' }
  | { status: 'ready'; Lines: ComponentType<{ series: VelocitySeries }> }
  | { status: 'failed' };

// One fixed height for the skeleton and the chart, so the swap shifts nothing.
const PLOT_HEIGHT = 'h-72';

const METRIC_LABELS = { stories: 'stories', engagement: 'engagement' } as const satisfies Record<
  Radar['metric'],
  string
>;

/** Recharts is fetched with a plain `import()` after mount: it stays out of every route's first load, server-rendered or not. */
function useLines() {
  const [state, setState] = useState<LinesState>({ status: 'loading' });
  useEffect(() => {
    let isCurrent = true;
    import('./VelocityLines').then(
      (module) => isCurrent && setState({ status: 'ready', Lines: module.default }),
      () => isCurrent && setState({ status: 'failed' }),
    );
    return () => {
      isCurrent = false;
    };
  }, []);
  return state;
}

function Legend({ series }: { series: VelocitySeries }) {
  return (
    <ul className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
      {series.map(({ tag, label }, index) => (
        <li key={tag} className="flex items-center gap-1.5">
          <svg aria-hidden="true" width="24" height="10" className="shrink-0">
            <line
              x1="0"
              y1="5"
              x2="24"
              y2="5"
              stroke={seriesStyle(index).stroke}
              strokeDasharray={seriesStyle(index).dash}
              strokeWidth={2}
            />
          </svg>
          {label}
        </li>
      ))}
    </ul>
  );
}

function DataTable({ caption, series }: { caption: string; series: VelocitySeries }) {
  const rows = toChartRows(series);
  return (
    <div className={`${PLOT_HEIGHT} overflow-auto`}>
      <table className="w-full text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="text-muted-foreground border-b text-left">
            <th scope="col" className="py-1.5 pr-2 font-medium">
              Date
            </th>
            {series.map(({ tag, label }) => (
              <th key={tag} scope="col" className="px-2 py-1.5 text-right font-medium">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.date} className="border-b last:border-b-0">
              <th scope="row" className="py-1.5 pr-2 text-left font-normal">
                {formatDay(row.date)}
              </th>
              {series.map(({ tag }) => (
                <td key={tag} className="px-2 py-1.5 text-right tabular-nums">
                  {row[tag] ?? 0}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Plot({ series }: { series: VelocitySeries }) {
  const lines = useLines();
  if (lines.status === 'failed') {
    return (
      <p role="alert" className={`${PLOT_HEIGHT} text-muted-foreground text-sm`}>
        The chart could not load. Use the table view instead.
      </p>
    );
  }
  if (lines.status === 'loading') return <Skeleton className={PLOT_HEIGHT} />;
  return (
    <div className={PLOT_HEIGHT}>
      <lines.Lines series={series} />
    </div>
  );
}

/** A multi-line trend chart of up to five tags, with a table of the same numbers one toggle away. */
export function TechVelocityChart({ title, window, metric, series }: TechVelocityChartProps) {
  const [isTable, setIsTable] = useState(false);
  const caption = `${title}: ${METRIC_LABELS[metric]} per day, last ${window}`;

  return (
    <figure className="grid gap-3">
      <figcaption className="font-medium">{title}</figcaption>
      {series.length === 0 ? (
        <p className={`${PLOT_HEIGHT} text-muted-foreground text-sm`}>
          No activity in this window yet.
        </p>
      ) : (
        <>
          <Legend series={series} />
          {isTable ? <DataTable caption={caption} series={series} /> : <Plot series={series} />}
        </>
      )}
      <div className="flex justify-end">
        <Button
          variant="toggleOutline"
          size="sm"
          aria-pressed={isTable}
          onClick={() => setIsTable((current) => !current)}
        >
          View as table
        </Button>
      </div>
    </figure>
  );
}
