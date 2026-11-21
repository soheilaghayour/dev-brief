// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Radar } from '@devbrief/shared';
import { TechVelocityChart } from './TechVelocityChart';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Recharts needs real layout; the stub shows that the lazy module arrived.
vi.mock('./VelocityLines', () => ({ default: () => <div data-testid="lines" /> }));

const SERIES = [
  {
    tag: 'rust',
    label: 'Rust',
    points: [
      { date: '2026-11-19', value: 4 },
      { date: '2026-11-20', value: 0 },
    ],
  },
  {
    tag: 'vue',
    label: 'Vue',
    points: [
      { date: '2026-11-19', value: 1 },
      { date: '2026-11-20', value: 7 },
    ],
  },
] as const satisfies Radar['series'];

let container: HTMLDivElement;
afterEach(() => container?.remove());

function chart(series: Radar['series']) {
  return <TechVelocityChart title="Velocity" window="7d" metric="stories" series={series} />;
}

async function renderChart(series: Radar['series'] = SERIES) {
  container = document.createElement('div');
  document.body.append(container);
  await act(async () => {
    createRoot(container).render(chart(series));
  });
}

const toggle = () => container.querySelector('button') as HTMLButtonElement;

describe('TechVelocityChart', () => {
  it('AC-3.3.3 renders a skeleton on the server, where the chart module is never imported', () => {
    const html = renderToStaticMarkup(chart(SERIES));
    expect(html).toContain('data-slot="skeleton"');
    expect(html).not.toContain('data-testid="lines"');
  });

  it('AC-3.3.3 swaps the skeleton for the lazily imported chart', async () => {
    await renderChart();
    expect(container.querySelector('[data-testid="lines"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="skeleton"]')).toBeNull();
  });

  it('AC-3.3.4 View as table swaps in one row per date and one column per tag', async () => {
    await renderChart();
    expect(toggle().textContent).toBe('View as table');
    expect(container.querySelector('table')).toBeNull();

    await act(async () => toggle().click());
    const table = container.querySelector('table');
    expect(table?.querySelector('caption')?.textContent).toContain('Velocity');
    expect([...(table?.querySelectorAll('thead th') ?? [])].map((th) => th.textContent)).toEqual([
      'Date',
      'Rust',
      'Vue',
    ]);
    const rows = [...(table?.querySelectorAll('tbody tr') ?? [])];
    expect(rows.map((row) => row.textContent)).toEqual(['Nov 1941', 'Nov 2007']);
    expect(container.querySelector('[data-testid="lines"]')).toBeNull();
    expect(toggle().getAttribute('aria-pressed')).toBe('true');
  });

  it('AC-3.3.4 the toggle is a native button, reachable and operable by keyboard', async () => {
    await renderChart();
    toggle().focus();
    expect(document.activeElement).toBe(toggle());
    expect(toggle().tagName).toBe('BUTTON');
    expect(toggle().tabIndex).toBe(0);
    expect(toggle().disabled).toBe(false);
  });

  it('says so when there is no activity to chart', async () => {
    await renderChart([]);
    expect(container.textContent).toContain('No activity in this window yet.');
  });

  it('AC-3.3.4 each legend swatch is a line with its series dash pattern', async () => {
    await renderChart();
    const lines = [...container.querySelectorAll('li svg line')];
    expect(lines.map((line) => line.getAttribute('stroke-dasharray'))).toEqual([null, '6 3']);
    expect(lines.map((line) => line.getAttribute('stroke'))).toEqual([
      'var(--chart-1)',
      'var(--chart-2)',
    ]);
  });
});
