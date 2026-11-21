// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClusterDetail, SourceRef, StoryCard } from '@devbrief/shared';
import { FeedList } from './FeedList';
import { RelatedToggle } from './RelatedToggle';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const api = vi.hoisted(() => ({ getCluster: vi.fn() }));
vi.mock('@/lib/api/endpoints', () => api);

// FeedList, for the keyboard test: its feed query, filters, saves and shortcut registry are stubbed.
const feed = vi.hoisted(() => ({
  stories: [] as unknown[],
  handlers: new Map<string, () => void>(),
  toggleSave: vi.fn(),
}));
vi.mock('@/config/features', () => ({ isFeatureEnabled: (flag: string) => flag === 'clusters' }));
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useInfiniteQuery: () => ({
    isPending: false,
    data: { pages: [{ items: feed.stories, nextCursor: null }], pageParams: [undefined] },
    hasNextPage: false,
    isFetchingNextPage: false,
    isFetchNextPageError: false,
    isPlaceholderData: false,
    fetchNextPage: () => {},
    refetch: () => {},
  }),
}));
vi.mock('./feedQueries', () => ({
  feedQueryOptions: () => ({}),
  personalisedPlaceholder: () => () => undefined,
}));
vi.mock('./useFeedFilters', () => ({
  useFeedFilters: () => ({
    filters: { sort: 'top', tags: [], kinds: [], sources: [], q: '' },
    focus: null,
    toggleSort: () => {},
    clearAll: () => {},
  }),
}));
vi.mock('@/components/preferences/usePreferenceState', () => ({
  usePreferenceState: () => ({
    prefs: { follow: { tags: [], sources: [] }, mute: { tags: [], sources: [] } },
    feedParams: {},
  }),
}));
vi.mock('@/components/saves/useSaves', () => ({
  useSaves: () => ({ isSaved: () => false, toggle: feed.toggleSave }),
}));
vi.mock('@/lib/hotkeys/HotkeysProvider', () => ({
  useShortcut: (shortcut: { keys: string }, handler: () => void) => {
    feed.handlers.set(shortcut.keys, handler);
  },
}));

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
let queryClient: QueryClient;
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

async function render(ui = <RelatedToggle storyId="rep" clusterId="cluster-1" memberCount={3} />) {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const root = createRoot(container);
  unmount = () => act(() => root.unmount());
  await act(async () => {
    root.render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
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
  feed.handlers.clear();
  feed.toggleSave.mockReset();
  Element.prototype.scrollIntoView = vi.fn();
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

  it('AC-2.2.1 keys the cluster query by id and keeps it fresh for a minute', async () => {
    await render();
    await click(toggle());

    const entry = queryClient.getQueryCache().find({ queryKey: ['cluster', 'cluster-1'] });
    expect(entry).toBeDefined();
    expect(entry?.observers[0]?.options.staleTime).toBe(60_000);
  });

  it('AC-2.2.1 lists the representative and the rest, never the card itself, for a stale card', async () => {
    await render(<RelatedToggle storyId="m1" clusterId="cluster-1" memberCount={3} />);

    await click(toggle());

    const links = [...container.querySelectorAll('li a')].map((link) => link.getAttribute('href'));
    expect(links).toEqual(['/story/rep', '/story/m2']);
  });

  it('shows pending feedback during Try again and announces a second failure', async () => {
    api.getCluster.mockRejectedValue(new Error('boom'));
    await render();
    await click(toggle());
    const alertBefore = container.querySelector('[role="alert"]');
    expect(alertBefore).not.toBeNull();

    let finish: (error: Error) => void = () => {};
    api.getCluster.mockReturnValueOnce(new Promise((_, reject) => (finish = reject)));
    const retry = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'Try again',
    );
    await act(async () => {
      (retry as HTMLButtonElement).click();
      // TanStack Query notifies observers on a timer.
      await new Promise((done) => setTimeout(done, 20));
    });
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      'Loading related coverage',
    );

    await act(async () => {
      finish(new Error('again'));
    });
    await settle();
    const alertAfter = container.querySelector('[role="alert"]');
    expect(alertAfter).not.toBeNull();
    expect(alertAfter).not.toBe(alertBefore);
  });

  it('AC-1.3.8 keeps j, k and s working on the feed with a card expanded', async () => {
    const clustered = {
      ...CLUSTER.representative,
      id: 'rep',
      cluster: { id: 'cluster-1', memberCount: 3, sources: CLUSTER.representative.sources },
    };
    feed.stories = [clustered, card('next', 'Next story', {})];
    await render(<FeedList />);

    await click(toggle());
    expect(container.querySelectorAll('li a')).toHaveLength(2);

    const activeId = () =>
      container.querySelector('[data-active="true"]')?.getAttribute('data-story-id');
    const press = (key: string) =>
      act(async () => {
        feed.handlers.get(key)?.();
      });
    await press('j');
    expect(activeId()).toBe('rep');
    await press('j');
    expect(activeId()).toBe('next');
    await press('k');
    expect(activeId()).toBe('rep');
    await press('s');
    expect(feed.toggleSave).toHaveBeenCalledWith('rep');
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
  });

  // Last, because it resets the module graph.
  it('shows the inline error when the list chunk fails to load, and Try again re-imports it', async () => {
    // A fresh module graph, so the failing chunk mock does not leak into the other tests.
    vi.resetModules();
    let chunkFails = true;
    vi.doMock('./RelatedMembers', async (importOriginal) => {
      if (chunkFails) throw new Error('Failed to fetch dynamically imported module');
      return importOriginal();
    });
    const [{ act: freshAct }, { createRoot: freshCreateRoot }, query, fresh] = await Promise.all([
      import('react'),
      import('react-dom/client'),
      import('@tanstack/react-query'),
      import('./RelatedToggle'),
    ]);
    const root = freshCreateRoot(container);
    unmount = () => freshAct(() => root.unmount());
    const freshClient = new query.QueryClient({ defaultOptions: { queries: { retry: false } } });
    await freshAct(async () => {
      root.render(
        <query.QueryClientProvider client={freshClient}>
          <fresh.RelatedToggle storyId="rep" clusterId="cluster-1" memberCount={3} />
        </query.QueryClientProvider>,
      );
    });

    await click(toggle());
    expect(container.textContent).toContain("Couldn't load related stories.");

    chunkFails = false;
    const retry = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'Try again',
    );
    await click(retry as HTMLButtonElement);

    expect(container.textContent).not.toContain("Couldn't load related stories.");
    expect(container.querySelectorAll('li a')).toHaveLength(2);
    vi.doUnmock('./RelatedMembers');
  });
});
