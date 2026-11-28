// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PreferenceMode } from '@/lib/guest/preferences';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const state = vi.hoisted(() => ({
  tagMode: null as PreferenceMode | null,
  kindMode: null as PreferenceMode | null,
  toggleTag: vi.fn(),
  toggleKind: vi.fn(),
  setMode: vi.fn(),
  setModes: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: { queryKey: unknown[] }) =>
    options.queryKey[0] === 'sources'
      ? {
          data: {
            sources: [
              { slug: 'hn', kind: 'hn', status: 'healthy', lastSuccessAt: null },
              { slug: 'blog-a', kind: 'rss', status: 'healthy', lastSuccessAt: null },
            ],
          },
        }
      : { data: { version: 1, tags: [{ slug: 'rust', label: 'Rust', count: 0 }] } },
  useQueryClient: () => ({}),
}));
vi.mock('@/components/preferences/usePreferenceState', () => ({
  usePreferenceState: () => ({ feedParams: {} }),
}));
vi.mock('@/components/preferences/usePreferences', () => ({
  usePreferences: () => ({
    isReady: true,
    prefs: {
      follow: { tags: [], sources: [] },
      mute: { tags: [], sources: state.kindMode === 'mute' ? ['hn', 'blog-a'] : [] },
    },
    modeOf: () => state.tagMode,
    setMode: state.setMode,
    setModes: state.setModes,
  }),
}));
vi.mock('./feedQueries', () => ({
  tagsQueryOptions: () => ({ queryKey: ['tags'] }),
  personalisedTagsPlaceholder: () => () => undefined,
  sourcesQueryOptions: { queryKey: ['sources'] },
}));
vi.mock('./useFeedFilters', () => ({
  useFeedFilters: () => ({
    filters: { sort: 'top', tags: [], kinds: [], sources: [], q: '' },
    toggleTag: state.toggleTag,
    toggleKind: state.toggleKind,
  }),
}));

const { TagFilterList } = await import('./TagFilterList');
const { SourceFilterList } = await import('./SourceFilterList');

let unmount = () => {};

function mount(ui: React.ReactNode) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(ui));
  unmount = () => {
    act(() => root.unmount());
    container.remove();
  };
  return container;
}

beforeEach(() => {
  state.tagMode = null;
  state.kindMode = null;
});
afterEach(() => {
  unmount();
  vi.clearAllMocks();
});

describe('the tag list hearts', () => {
  it('AC-2.5.1 puts a heart on the row that is a separate control from the filter checkbox', () => {
    const container = mount(<TagFilterList />);
    const heart = container.querySelector('button[aria-label^="Rust:"]')!;
    expect(heart.closest('label')).toBeNull();
    expect(container.querySelector('label input[type="checkbox"]')).not.toBeNull();
  });

  it('AC-2.5.1 clicking the heart sets the next state and leaves the filter alone', () => {
    const container = mount(<TagFilterList />);
    act(() => container.querySelector<HTMLElement>('button[aria-label^="Rust:"]')!.click());
    expect(state.setMode).toHaveBeenCalledWith('tag', 'rust', 'follow');
    expect(state.toggleTag).not.toHaveBeenCalled();
  });

  it('AC-2.5.1 clicking the row toggles the filter and leaves the heart alone', () => {
    const container = mount(<TagFilterList />);
    act(() => container.querySelector<HTMLElement>('label')!.click());
    expect(state.toggleTag).toHaveBeenCalledWith('rust');
    expect(state.setMode).not.toHaveBeenCalled();
  });

  it('AC-2.5.1 keeps a muted tag listed with the crossed heart', () => {
    state.tagMode = 'mute';
    const container = mount(<TagFilterList />);
    expect(container.textContent).toContain('Rust');
    const heart = container.querySelector('button[aria-label="Rust: muted. Click to clear."]');
    expect(heart?.querySelector('svg.lucide-heart-off')).not.toBeNull();
  });
});

describe('the source list hearts', () => {
  it('AC-2.5.1 clicking a kind heart sets the next state on its sources and leaves the filter alone', () => {
    const container = mount(<SourceFilterList />);
    const heart = container.querySelector<HTMLElement>('button[aria-label^="Blogs:"]')!;
    expect(heart.closest('label')).toBeNull();
    act(() => heart.click());
    expect(state.setModes).toHaveBeenCalledWith('source', ['blog-a'], 'follow');
    expect(state.toggleKind).not.toHaveBeenCalled();
  });

  it('AC-2.5.1 clicking the kind row toggles the filter and leaves the heart alone', () => {
    const container = mount(<SourceFilterList />);
    act(() => container.querySelector<HTMLElement>('[data-kind="rss"] label')!.click());
    expect(state.toggleKind).toHaveBeenCalledWith('rss');
    expect(state.setModes).not.toHaveBeenCalled();
  });

  it('AC-2.5.1 keeps a muted source kind listed with the crossed heart', () => {
    state.kindMode = 'mute';
    const container = mount(<SourceFilterList />);
    const heart = container.querySelector('button[aria-label="Blogs: muted. Click to clear."]');
    expect(heart?.querySelector('svg.lucide-heart-off')).not.toBeNull();
  });
});
