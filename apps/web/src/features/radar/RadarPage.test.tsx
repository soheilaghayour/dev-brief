// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NuqsTestingAdapter, type UrlUpdateEvent } from 'nuqs/adapters/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Radar, TagSlug } from '@devbrief/shared';
import { RadarPage } from './RadarPage';
import { radarQueryOptions } from './radarQueries';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('./VelocityLines', () => ({ default: () => <div data-testid="lines" /> }));

const SLUGS = ['ai-llms', 'rust', 'vue', 'go', 'react', 'typescript'] as const;
const movers = SLUGS.map((tag, index) => ({
  tag,
  label: tag,
  current: 60 - index,
  previous: 10,
  deltaPct: 100,
}));
const series = (tags: readonly TagSlug[]) =>
  tags.map((tag) => ({ tag, label: tag, points: [{ date: '2026-11-20', value: 1 }] }));

let container: HTMLDivElement;
afterEach(() => container.remove());

async function renderPage(
  searchParams: string,
  charted: readonly TagSlug[],
  radarMovers: Radar['movers'] = movers,
) {
  const updates: UrlUpdateEvent[] = [];
  const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  const data: Radar = {
    window: '7d',
    metric: 'stories',
    series: series(charted),
    movers: radarMovers,
  };
  queryClient.setQueryData(
    radarQueryOptions({ window: '7d', metric: 'stories', tags: [...charted] }).queryKey,
    data,
  );
  queryClient.setQueryData(
    radarQueryOptions({ window: '7d', metric: 'stories', tags: [] }).queryKey,
    data,
  );
  container = document.createElement('div');
  document.body.append(container);
  await act(async () => {
    createRoot(container).render(
      <QueryClientProvider client={queryClient}>
        <NuqsTestingAdapter searchParams={searchParams} onUrlUpdate={(e) => updates.push(e)}>
          <RadarPage />
        </NuqsTestingAdapter>
      </QueryClientProvider>,
    );
  });
  return updates;
}

const box = (tag: string) =>
  container.querySelector<HTMLInputElement>(`input[aria-label="Show ${tag} in chart"]`);

describe('RadarPage', () => {
  it('AC-3.3.1 without tags in the URL the top five movers are charted', async () => {
    await renderPage('', SLUGS.slice(0, 5));
    expect(SLUGS.slice(0, 5).every((tag) => box(tag)?.checked)).toBe(true);
    expect(box('typescript')?.checked).toBe(false);
    expect(box('typescript')?.disabled).toBe(true);
    expect(container.querySelector('[data-testid="lines"]')).not.toBeNull();
  });

  it('AC-3.3.1 unticking a default tag writes the remaining tags to the URL', async () => {
    const updates = await renderPage('', SLUGS.slice(0, 5));
    await act(async () => box('vue')?.click());
    const params = new URLSearchParams(updates.at(-1)?.queryString);
    expect(params.get('tags')).toBe('ai-llms,rust,go,react');
  });

  it('AC-3.3.1 with tags in the URL exactly those are ticked', async () => {
    await renderPage('?tags=rust,vue', ['rust', 'vue']);
    expect(box('rust')?.checked).toBe(true);
    expect(box('vue')?.checked).toBe(true);
    expect(box('ai-llms')?.checked).toBe(false);
    expect(box('ai-llms')?.disabled).toBe(false);
  });

  it('AC-3.3.1 a charted tag that left the movers keeps a row and can be unticked', async () => {
    const updates = await renderPage('?tags=rust,databases', ['rust', 'databases']);
    expect(box('databases')?.checked).toBe(true);
    await act(async () => box('databases')?.click());
    const params = new URLSearchParams(updates.at(-1)?.queryString);
    expect(params.get('tags')).toBe('rust');
  });
});
