// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Preferences } from '@devbrief/shared';
import { FeedPreferencesSection } from './FeedPreferencesSection';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PREFS: Preferences = {
  follow: { tags: ['react', 'rust'], sources: ['rss-react-blog'] },
  mute: { tags: ['career'], sources: [] },
};
const setMode = vi.fn();
const state = vi.hoisted(() => ({ isReady: true }));

vi.mock('./usePreferences', () => ({
  usePreferences: () => ({ isReady: state.isReady, prefs: PREFS, setMode }),
}));
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQuery: () => ({ data: { sources: [{ slug: 'rss-react-blog', name: 'React Blog' }] } }),
}));

let unmount = () => {};
afterEach(() => {
  unmount();
  setMode.mockClear();
  state.isReady = true;
});

function mount() {
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() => root.render(<FeedPreferencesSection />));
  unmount = () => act(() => root.unmount());
  return container;
}

function chipLabels(container: HTMLElement) {
  return [...container.querySelectorAll('button')].map((chip) => chip.getAttribute('aria-label'));
}

describe('FeedPreferencesSection', () => {
  it('AC-2.5.1 lists follows and mutes as chips, sources by their name', () => {
    const container = mount();
    expect(container.querySelector('h2')?.textContent).toBe('Feed');
    expect(container.textContent).toContain('Followed:ReactRustReact Blog');
    expect(container.textContent).toContain('Muted:Career');
    expect(chipLabels(container)).toEqual([
      'Unfollow React',
      'Unfollow Rust',
      'Unfollow React Blog',
      'Unmute Career',
    ]);
  });

  it('AC-2.5.1 removes a preference with its chip', () => {
    const container = mount();
    const chips = [...container.querySelectorAll('button')];
    act(() => chips[2]?.click());
    expect(setMode).toHaveBeenCalledWith('source', 'rss-react-blog', null);
    act(() => chips[3]?.click());
    expect(setMode).toHaveBeenCalledWith('tag', 'career', null);
  });

  it('lists nothing until the preferences are known', () => {
    state.isReady = false;
    expect(chipLabels(mount())).toEqual([]);
  });
});
