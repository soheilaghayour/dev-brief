// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClusterDetail, SourceRef, StoryCard } from '@devbrief/shared';
import { RelatedToggle } from './RelatedToggle';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const api = vi.hoisted(() => ({ getCluster: vi.fn() }));
vi.mock('@/lib/api/endpoints', () => api);

function card(id: string, title: string, source: Partial<SourceRef>): StoryCard {
  return {
    id,
    title,
    url: `https://example.com/${id}`,
    domain: 'example.com',
    excerpt: null,
    author: null,
    publishedAt: '2026-11-20T10:00:00.000Z',
    tags: [],
    readingTimeMinutes: null,
    rankScore: 1,
    sources: [
      {
        kind: 'devto',
        slug: 'devto',
        name: 'Dev.to',
        itemUrl: `https://dev.to/${id}`,
        points: null,
        comments: null,
        reactions: 95,
        stars: null,
        ...source,
      },
    ],
  };
}

const CLUSTER: ClusterDetail = {
  id: 'cluster-1',
  representative: card('rep', 'Representative', {}),
  members: [
    card('m1', 'Dev.to take on it', {}),
    card('m2', 'A blog post about it', {
      kind: 'rss',
      slug: 'blog',
      name: 'Some Blog',
      reactions: null,
    }),
  ],
  sourceKinds: ['devto', 'rss'],
  summary: null,
};

let container: HTMLDivElement;
let unmount = () => {};

async function settle(maxMs = 3000) {
  // The lazy chunk and the mocked request resolve after a few ticks; the first load transforms the chunk.
  const deadline = Date.now() + maxMs;
  do {
    await act(async () => {
      await new Promise((done) => setTimeout(done, 20));
    });
  } while (container.querySelector('[role="status"]') && Date.now() < deadline);
}

async function render() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const root = createRoot(container);
  unmount = () => act(() => root.unmount());
  await act(async () => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <RelatedToggle clusterId="cluster-1" memberCount={3} />
      </QueryClientProvider>,
    );
  });
}

const toggle = () => container.querySelector('button[aria-expanded]') as HTMLButtonElement;

async function click(element: HTMLElement, maxMs?: number) {
  await act(async () => {
    element.click();
  });
  await settle(maxMs);
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  api.getCluster.mockReset();
  api.getCluster.mockResolvedValue(CLUSTER);
});

afterEach(async () => {
  await unmount();
  container.remove();
});

describe('RelatedToggle', () => {
  it('AC-2.2.1 shows "+N related" with N = memberCount - 1 and fetches nothing until expanded', async () => {
    await render();
    expect(toggle().textContent).toContain('+2 related');
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(api.getCluster).not.toHaveBeenCalled();
  });

  it('AC-2.2.1 expands the other members inline with title, source badge and a story link, without navigating', async () => {
    const before = window.location.href;
    await render();

    await click(toggle());

    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(
      container.querySelector(`#${CSS.escape(toggle().getAttribute('aria-controls') ?? '')}`),
    ).not.toBeNull();
    const links = [...container.querySelectorAll('li a')];
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['/story/m1', '/story/m2']);
    expect(links.map((link) => link.textContent)).toEqual([
      'Dev.to take on it',
      'A blog post about it',
    ]);
    expect(container.querySelector('li [data-source-kind="rss"]')?.textContent).toContain(
      'Some Blog',
    );
    expect(window.location.href).toBe(before);
  });

  it('AC-2.2.1 fetches once and serves a re-expand from the cache, with aria-expanded toggling', async () => {
    await render();

    await click(toggle());
    await click(toggle());
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    await click(toggle());

    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(container.querySelectorAll('li a')).toHaveLength(2);
    expect(api.getCluster).toHaveBeenCalledTimes(1);
    expect(api.getCluster).toHaveBeenCalledWith('cluster-1');
  });

  it('AC-2.2.1 shows a skeleton while the request runs', async () => {
    api.getCluster.mockReturnValue(new Promise(() => {}));
    await render();

    await click(toggle(), 200);

    expect(container.querySelector('[role="status"]')).not.toBeNull();
    expect(container.querySelector('li')).toBeNull();
  });

  it('AC-2.2.1 shows the error inline and "Try again" fetches again', async () => {
    api.getCluster.mockRejectedValueOnce(new Error('boom'));
    await render();

    await click(toggle());
    expect(container.textContent).toContain("Couldn't load related stories.");
    const retry = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'Try again',
    );
    expect(retry).toBeDefined();

    await click(retry as HTMLButtonElement);

    expect(api.getCluster).toHaveBeenCalledTimes(2);
    expect(container.querySelectorAll('li a')).toHaveLength(2);
  });

  it('AC-2.2.1 keeps focus on the control after toggling', async () => {
    await render();
    toggle().focus();

    await click(toggle());

    expect(document.activeElement).toBe(toggle());
  });
});
