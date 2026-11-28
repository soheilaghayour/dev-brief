// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Preferences } from '@devbrief/shared';
import { EMPTY_PREFERENCES } from '@/lib/guest/guestState';
import { useGuestStore } from '@/lib/guest/guestStore';
import { useGuestReady } from '@/lib/guest/hydrateGuestStore';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const me = vi.hoisted(() => ({ current: { data: null as object | null, isPending: false } }));
const api = vi.hoisted(() => ({ getPreferences: vi.fn(), putPreferences: vi.fn() }));
vi.mock('@/lib/auth/useMe', () => ({ useMe: () => me.current }));
vi.mock('@/lib/api/endpoints', () => api);
vi.mock('@/lib/toast/notify', () => ({ notify: vi.fn() }));
vi.mock('@/components/feed/feedQueries', () => ({
  sourcesQueryOptions: {
    queryKey: ['sources'],
    queryFn: async () => ({
      sources: [
        { slug: 'hn', kind: 'hn' },
        { slug: 'blog-a', kind: 'rss' },
        { slug: 'blog-b', kind: 'rss' },
      ],
    }),
  },
}));

const { TagHeart } = await import('./TagHeart');
const { SourceKindHeart } = await import('./SourceKindHeart');
await import('./changePreference');

let unmount = () => {};

async function mount(ui: React.ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () =>
    root.render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>),
  );
  unmount = () => {
    act(() => root.unmount());
    container.remove();
  };
  return container;
}

const heart = (container: HTMLElement, label: string) =>
  [...container.querySelectorAll('button')].find((button) =>
    button.getAttribute('aria-label')?.startsWith(`${label}:`),
  )!;
const nameOf = (container: HTMLElement, label: string) =>
  heart(container, label).getAttribute('aria-label');
const settle = (check: () => void) => act(() => vi.waitFor(check));

beforeEach(() => {
  me.current = { data: null, isPending: false };
  useGuestStore.setState({ prefs: EMPTY_PREFERENCES });
  useGuestReady.setState({ ready: true });
  localStorage.clear();
});
afterEach(() => {
  unmount();
  vi.clearAllMocks();
});

describe('hearts as a guest', () => {
  it('AC-2.5.1 keeps the state in the guest store, so a remount shows it again', async () => {
    const first = await mount(<TagHeart slug="react" />);
    await act(async () => heart(first, 'React').click());
    await settle(() => expect(nameOf(first, 'React')).toBe('React: following. Click to mute.'));
    expect(useGuestStore.getState().prefs.follow.tags).toEqual(['react']);
    unmount();

    const second = await mount(<TagHeart slug="react" />);
    expect(nameOf(second, 'React')).toBe('React: following. Click to mute.');
  });

  it('AC-2.5.1 shows a change made by one heart on every other heart of the same tag', async () => {
    const container = await mount(
      <>
        <TagHeart slug="rust" />
        <TagHeart slug="rust" />
      </>,
    );
    await act(async () => container.querySelectorAll('button')[0]?.click());
    await settle(() =>
      expect(
        [...container.querySelectorAll('button')].map((b) => b.getAttribute('aria-label')),
      ).toEqual(['Rust: following. Click to mute.', 'Rust: following. Click to mute.']),
    );
  });

  it('AC-2.5.1 sets a source kind on every source of the kind in one change, and shows mixed as empty', async () => {
    useGuestStore.setState({
      prefs: { ...EMPTY_PREFERENCES, mute: { tags: [], sources: ['blog-b'] } },
    });
    const container = await mount(<SourceKindHeart kind="rss" />);
    await settle(() => expect(heart(container, 'Blogs').disabled).toBe(false));

    await act(async () => heart(container, 'Blogs').click());
    await settle(() => expect(nameOf(container, 'Blogs')).toBe('Blogs: following. Click to mute.'));
    expect(useGuestStore.getState().prefs.follow.sources).toEqual(['blog-a', 'blog-b']);
    expect(useGuestStore.getState().prefs.mute.sources).toEqual([]);
  });
});

describe('hearts with an account', () => {
  const STORED: Preferences = {
    follow: { tags: [], sources: [] },
    mute: { tags: [], sources: [] },
  };

  beforeEach(() => {
    me.current = { data: { id: 'u1' }, isPending: false };
    api.getPreferences.mockResolvedValue(STORED);
  });

  it('AC-2.5.1 sends each click as a preference change', async () => {
    // The refetch after a PUT reads what the PUT stored.
    let stored = STORED;
    api.getPreferences.mockImplementation(async () => stored);
    api.putPreferences.mockImplementation(async (prefs: Preferences) => (stored = prefs));
    const container = await mount(<TagHeart slug="react" />);
    await settle(() => expect(heart(container, 'React').disabled).toBe(false));

    await act(async () => heart(container, 'React').click());
    await settle(() =>
      expect(api.putPreferences).toHaveBeenLastCalledWith({
        ...STORED,
        follow: { tags: ['react'], sources: [] },
      }),
    );
    await settle(() => expect(api.getPreferences).toHaveBeenCalledTimes(2));
    await act(async () => heart(container, 'React').click());
    await settle(() =>
      expect(api.putPreferences).toHaveBeenLastCalledWith({
        follow: { tags: [], sources: [] },
        mute: { tags: ['react'], sources: [] },
      }),
    );
  });

  it('AC-2.5.1 sends a kind-wide click as one request', async () => {
    api.putPreferences.mockImplementation(async (prefs: Preferences) => prefs);
    const container = await mount(<SourceKindHeart kind="rss" />);
    await settle(() => expect(heart(container, 'Blogs').disabled).toBe(false));

    await act(async () => heart(container, 'Blogs').click());
    await settle(() => expect(api.putPreferences).toHaveBeenCalledTimes(1));
    expect(api.putPreferences).toHaveBeenCalledWith({
      ...STORED,
      follow: { tags: [], sources: ['blog-a', 'blog-b'] },
    });
  });

  it('AC-2.5.1 shows the new state at once and rolls the icon back when the request fails', async () => {
    api.putPreferences.mockRejectedValue(new Error('500'));
    const container = await mount(<TagHeart slug="react" />);
    await settle(() => expect(heart(container, 'React').disabled).toBe(false));

    await act(async () => heart(container, 'React').click());
    await settle(() => expect(api.putPreferences).toHaveBeenCalledTimes(1));
    await settle(() =>
      expect(nameOf(container, 'React')).toBe('React: not followed. Click to follow.'),
    );
  });
});
