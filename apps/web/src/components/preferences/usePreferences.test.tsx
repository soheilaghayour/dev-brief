// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Preferences } from '@devbrief/shared';
import { PREFS_FAILED_NOTICE } from './accountPreferences';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const me = vi.hoisted(() => ({ current: { data: null as object | null, isPending: false } }));
const api = vi.hoisted(() => ({ getPreferences: vi.fn(), putPreferences: vi.fn() }));
const notify = vi.hoisted(() => vi.fn());
const setGuestPreference = vi.hoisted(() => vi.fn(async () => 'changed'));

vi.mock('@/config/features', () => ({ isFeatureEnabled: () => true }));
vi.mock('@/lib/auth/useMe', () => ({ useMe: () => me.current }));
vi.mock('@/lib/api/endpoints', () => api);
vi.mock('@/lib/toast/notify', () => ({ notify }));
vi.mock('@/lib/guest/guestPreferences', () => ({ setGuestPreference }));

const { usePreferences } = await import('./usePreferences');
// The write path is a lazy chunk; loading it up front keeps its first transform out of the waits below.
await import('./changePreference');

const STORED: Preferences = {
  follow: { tags: ['rust'], sources: ['hn'] },
  mute: { tags: [], sources: [] },
};

type Hook = ReturnType<typeof usePreferences>;
let latest: Hook | undefined;
let unmount = () => {};

function Probe() {
  latest = usePreferences();
  return null;
}

// Waits inside act, so the updates the awaited work causes are rendered before the next assertion.
function settle(check: () => void) {
  return act(() => vi.waitFor(check));
}

function hook() {
  if (!latest) throw new Error('Not rendered');
  return latest;
}

async function render() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const root = createRoot(document.createElement('div'));
  await act(async () =>
    root.render(
      <QueryClientProvider client={queryClient}>
        <Probe />
      </QueryClientProvider>,
    ),
  );
  unmount = () => act(() => root.unmount());
}

beforeEach(() => {
  me.current = { data: { id: 'u1' }, isPending: false };
  api.getPreferences.mockResolvedValue(STORED);
  latest = undefined;
});

afterEach(() => {
  unmount();
  vi.clearAllMocks();
});

describe('usePreferences in account mode', () => {
  it('AC-2.5.1 sends the full set via PUT and derives the feed params from it', async () => {
    // The refetch after the PUT reads what the PUT stored.
    let stored = STORED;
    api.getPreferences.mockImplementation(async () => stored);
    api.putPreferences.mockImplementation(async (prefs: Preferences) => (stored = prefs));
    await render();
    await settle(() => expect(hook().isReady).toBe(true));
    expect(hook().modeOf('tag', 'rust')).toBe('follow');

    await act(async () => hook().setMode('tag', 'react', 'mute'));
    await settle(() =>
      expect(api.putPreferences).toHaveBeenCalledWith({
        follow: { tags: ['rust'], sources: ['hn'] },
        mute: { tags: ['react'], sources: [] },
      }),
    );
    await settle(() => expect(api.getPreferences).toHaveBeenCalledTimes(2));
    expect(hook().modeOf('tag', 'react')).toBe('mute');
    expect(hook().feedParams).toEqual({
      excludeTags: ['react'],
      boostTags: ['rust'],
      boostSources: ['hn'],
    });
  });

  it('AC-2.5.1 shows the change at once, then rolls back and shows a toast when the PUT fails', async () => {
    let fail: (error: Error) => void = () => {};
    api.putPreferences.mockImplementation(() => new Promise((_resolve, reject) => (fail = reject)));
    await render();
    await settle(() => expect(hook().isReady).toBe(true));

    await act(async () => hook().setMode('source', 'hn', null));
    await settle(() => expect(hook().modeOf('source', 'hn')).toBeNull());

    await act(async () => fail(new Error('500')));
    await settle(() => expect(hook().modeOf('source', 'hn')).toBe('follow'));
    expect(notify).toHaveBeenCalledWith(PREFS_FAILED_NOTICE);
  });

  it('starts a change from the stored set, not from empty, when it has not loaded yet', async () => {
    let finishLoad: (prefs: Preferences) => void = () => {};
    api.getPreferences.mockImplementation(() => new Promise((resolve) => (finishLoad = resolve)));
    api.putPreferences.mockImplementation(async (prefs: Preferences) => prefs);
    await render();
    expect(hook().isReady).toBe(false);

    await act(async () => hook().setMode('tag', 'go', 'follow'));
    expect(api.putPreferences).not.toHaveBeenCalled();
    await act(async () => finishLoad(STORED));
    await settle(() =>
      expect(api.putPreferences).toHaveBeenCalledWith({
        follow: { tags: ['rust', 'go'], sources: ['hn'] },
        mute: { tags: [], sources: [] },
      }),
    );
  });
});

describe('usePreferences in guest mode', () => {
  it('AC-2.5.1 keeps changes on the device, also while /me is pending', async () => {
    me.current = { data: null, isPending: true };
    await render();
    expect(hook().isReady).toBe(false);
    await act(async () => hook().setMode('tag', 'react', 'follow'));
    expect(setGuestPreference).toHaveBeenCalledWith('tag', 'react', 'follow');
    expect(api.getPreferences).not.toHaveBeenCalled();
    expect(api.putPreferences).not.toHaveBeenCalled();
  });
});
