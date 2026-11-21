import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatDay, toChartRows, type VelocitySeries } from './chartRows';
import { seriesStyle } from './seriesStyles';

/** The Recharts line chart; the only module that imports Recharts, so it loads on demand. */
export default function VelocityLines({ series }: { series: VelocitySeries }) {
  const rows = toChartRows(series);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={formatDay}
          stroke="var(--muted-foreground)"
          tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
          minTickGap={24}
        />
        <YAxis
          allowDecimals={false}
          width={40}
          stroke="var(--muted-foreground)"
          tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
        />
        <Tooltip
          labelFormatter={(label) => formatDay(String(label))}
          contentStyle={{
            background: 'var(--popover)',
            color: 'var(--popover-foreground)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
          }}
        />
        {series.map(({ tag, label }, index) => (
          <Line
            key={tag}
            dataKey={tag}
            name={label}
            type="monotone"
            stroke={seriesStyle(index).stroke}
            strokeDasharray={seriesStyle(index).dash}
            strokeWidth={2}
            dot={false}
            // No motion at all, so the chart is the same under prefers-reduced-motion.
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
