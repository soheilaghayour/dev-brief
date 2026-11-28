import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TAG_LABELS, TAG_SLUGS } from '@devbrief/shared';
import { EMPTY_PREFERENCES } from '@/lib/guest/guestState';

const sourcesQuery = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
const preferences = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQuery: () => sourcesQuery.current,
}));
vi.mock('./usePreferences', () => ({ usePreferences: () => preferences.current }));

const { FeedPreferencesSection } = await import('./FeedPreferencesSection');

beforeEach(() => {
  sourcesQuery.current = {
    isPending: false,
    isError: false,
    data: {
      sources: [
        { slug: 'hn', kind: 'hn', status: 'healthy', lastSuccessAt: null },
        { slug: 'blog-a', kind: 'rss', status: 'healthy', lastSuccessAt: null },
        { slug: 'blog-b', kind: 'rss', status: 'healthy', lastSuccessAt: null },
      ],
    },
  };
  preferences.current = {
    isReady: true,
    isError: false,
    refetch: () => {},
    prefs: EMPTY_PREFERENCES,
    modeOf: () => null,
    setMode: () => {},
    setModes: () => {},
  };
});

describe('FeedPreferencesSection', () => {
  it('AC-2.5.1 shows an error with Retry when the account preferences fail to load', () => {
    preferences.current.isError = true;
    const html = renderToStaticMarkup(<FeedPreferencesSection />);
    expect(html).toContain('role="alert"');
    expect(html).toContain('load your feed preferences');
    expect(html).toContain('Retry');
  });

  it('AC-2.5.1 lists every tag and every source kind with a heart, as the sidebar does', () => {
    const html = renderToStaticMarkup(<FeedPreferencesSection />);
    expect(html).not.toContain('role="alert"');
    for (const slug of TAG_SLUGS) {
      expect(html).toContain(`aria-label="${TAG_LABELS[slug]}: not followed. Click to follow."`);
    }
    for (const label of ['Hacker News', 'Blogs']) {
      expect(html).toContain(`aria-label="${label}: not followed. Click to follow."`);
    }
    // Only the kinds `/sources` lists get a row.
    expect(html).not.toContain('Dev.to:');
  });

  it('AC-2.5.1 says the sources are unavailable when their request fails, and still lists every tag', () => {
    sourcesQuery.current = { isPending: false, isError: true, data: undefined };
    const html = renderToStaticMarkup(<FeedPreferencesSection />);
    expect(html).toContain('Sources unavailable.');
    expect(html).toContain('aria-label="React: not followed. Click to follow."');
  });
});
