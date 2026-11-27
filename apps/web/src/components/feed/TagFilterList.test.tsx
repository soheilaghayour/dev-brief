import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TagList } from '@devbrief/shared';
import { TagFilterList } from './TagFilterList';

const query = vi.hoisted(() => ({
  data: undefined as TagList | undefined,
  isPending: false,
  options: [] as unknown[],
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: unknown) => {
    query.options.push(options);
    return { data: query.data, isPending: query.isPending };
  },
  useQueryClient: () => ({}),
}));
vi.mock('@/components/preferences/usePreferenceState', () => ({
  usePreferenceState: () => ({ feedParams: {} }),
}));
vi.mock('./feedQueries', () => ({
  tagsQueryOptions: () => ({ queryKey: ['tags'] }),
  personalisedTagsPlaceholder: () => () => undefined,
}));
vi.mock('./useFeedFilters', () => ({
  useFeedFilters: () => ({
    filters: { sort: 'top', tags: ['react'], kinds: [], sources: [], q: '' },
    toggleTag: () => {},
  }),
}));

beforeEach(() => {
  query.options = [];
  query.isPending = false;
  query.data = {
    version: 1,
    tags: [
      { slug: 'react', label: 'React', count: 42 },
      { slug: 'rust', label: 'Rust', count: 0 },
    ],
  };
});

describe('TagFilterList', () => {
  it('AC-1.3.11 shows the count of each tag, 0 included', () => {
    const html = renderToStaticMarkup(<TagFilterList />);
    expect(html).toMatch(/React<\/span><span[^>]*>42</);
    expect(html).toMatch(/Rust<\/span><span[^>]*>0</);
  });

  it('AC-1.3.11 titles the group "Tags", with no 7-day label', () => {
    const html = renderToStaticMarkup(<TagFilterList />);
    expect(html).toContain('<span>Tags</span>');
    expect(html).not.toContain('7d');
  });

  it('AC-1.3.11 keeps the previous counts on screen while new ones load', () => {
    renderToStaticMarkup(<TagFilterList />);
    expect(query.options[0]).toHaveProperty('placeholderData');
  });
});
