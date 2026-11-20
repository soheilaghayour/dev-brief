// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const KEY = 'devbrief:guest:v1';

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
});

async function load() {
  const { applyStoredMutes } = await import('./storedMutes');
  const { useGuestStore } = await import('./guestStore');
  return { applyStoredMutes, useGuestStore };
}

describe('applyStoredMutes', () => {
  it('AC-2.5.2 puts the stored mutes in the store at once, before the parser has loaded', async () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ version: 1, prefs: { mute: { tags: ['career', 4], sources: ['hn'] } } }),
    );
    const { applyStoredMutes, useGuestStore } = await load();

    applyStoredMutes();

    expect(useGuestStore.getState().prefs).toEqual({
      follow: { tags: [], sources: [] },
      mute: { tags: ['career'], sources: ['hn'] },
    });
  });

  it('leaves the store alone when nothing usable is stored or the store has loaded', async () => {
    const { applyStoredMutes, useGuestStore } = await load();
    applyStoredMutes();
    localStorage.setItem(KEY, '{broken');
    applyStoredMutes();
    expect(useGuestStore.getState().prefs.mute).toEqual({ tags: [], sources: [] });

    localStorage.setItem(
      KEY,
      JSON.stringify({ version: 1, prefs: { mute: { tags: ['career'] } } }),
    );
    const { useGuestReady } = await import('./hydrateGuestStore');
    useGuestReady.setState({ ready: true });
    applyStoredMutes();
    expect(useGuestStore.getState().prefs.mute.tags).toEqual([]);
  });
});
