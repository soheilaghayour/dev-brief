import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { SearchInput } from './SearchInput';

vi.mock('@/lib/hotkeys/HotkeysProvider', () => ({ useShortcut: () => {} }));
vi.mock('./useFeedFilters', () => ({
  useFeedFilters: () => ({ filters: { q: '' }, setQuery: () => {} }),
}));

describe('SearchInput', () => {
  it('AC-1.3.4 stops at 100 characters, the API limit, so a search can never get a 400', () => {
    expect(renderToStaticMarkup(<SearchInput />)).toContain('maxLength="100"');
  });
});
