// A dash pattern next to each colour keeps the lines apart without colour (WCAG 1.4.1).
export const CHART_SERIES_STYLES = [
  { stroke: 'var(--chart-1)', dash: undefined },
  { stroke: 'var(--chart-2)', dash: '6 3' },
  { stroke: 'var(--chart-3)', dash: '2 3' },
  { stroke: 'var(--chart-4)', dash: '8 3 2 3' },
  { stroke: 'var(--chart-5)', dash: '1 4' },
] as const;

export function seriesStyle(index: number) {
  return CHART_SERIES_STYLES[index % CHART_SERIES_STYLES.length] ?? CHART_SERIES_STYLES[0];
}
