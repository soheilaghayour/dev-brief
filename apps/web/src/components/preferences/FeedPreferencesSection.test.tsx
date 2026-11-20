import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_PREFERENCES } from '@/lib/guest/guestState';

const preferences = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQuery: () => ({ data: undefined }),
}));
vi.mock('./usePreferences', () => ({ usePreferences: () => preferences.current }));

const { FeedPreferencesSection } = await import('./FeedPreferencesSection');

beforeEach(() => {
  preferences.current = {
    isReady: false,
    isError: false,
    refetch: () => {},
    prefs: EMPTY_PREFERENCES,
    setMode: () => {},
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

  it('shows the lists, and no error, once the preferences are known', () => {
    preferences.current.isReady = true;
    const html = renderToStaticMarkup(<FeedPreferencesSection />);
    expect(html).toContain('Followed:');
    expect(html).not.toContain('role="alert"');
  });
});
