// A dash pattern next to each colour keeps the lines apart without colour (WCAG 1.4.1); the classes are literal so Tailwind sees them.
export const CHART_SERIES_STYLES = [
  { stroke: 'var(--chart-1)', dash: undefined, swatch: 'bg-chart-1' },
  { stroke: 'var(--chart-2)', dash: '6 3', swatch: 'bg-chart-2' },
  { stroke: 'var(--chart-3)', dash: '2 3', swatch: 'bg-chart-3' },
  { stroke: 'var(--chart-4)', dash: '8 3 2 3', swatch: 'bg-chart-4' },
  { stroke: 'var(--chart-5)', dash: '1 4', swatch: 'bg-chart-5' },
] as const;

export function seriesStyle(index: number) {
  return CHART_SERIES_STYLES[index % CHART_SERIES_STYLES.length] ?? CHART_SERIES_STYLES[0];
}
