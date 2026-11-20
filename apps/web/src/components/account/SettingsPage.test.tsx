import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useMe = vi.fn();
vi.mock('@/lib/auth/useMe', () => ({ useMe: () => useMe() }));
vi.mock('@/lib/auth/useSignOut', () => ({ useSignOut: () => vi.fn() }));
vi.mock('./DeleteAccountDialog', () => ({ DeleteAccountDialog: () => null }));
const features = vi.hoisted(() => ({ preferences: false }));
vi.mock('@/config/features', () => ({
  isFeatureEnabled: (flag: 'preferences') => features[flag],
}));
vi.mock('@/components/preferences/FeedPreferencesSection', () => ({
  FeedPreferencesSection: () => <section>Feed preferences</section>,
}));

const { SettingsPage } = await import('./SettingsPage');

const user = {
  id: 'u1',
  name: 'Jane Doe',
  email: 'jane@example.com',
  image: null,
  providers: ['github'],
  createdAt: '2026-01-01T00:00:00.000Z',
};

beforeEach(() => {
  useMe.mockReset();
  features.preferences = false;
});

describe('SettingsPage', () => {
  it('AC-1.6.3 shows Appearance and "Clear local data" to a guest, without an Account section', () => {
    useMe.mockReturnValue({ data: null, isPending: false });
    const html = renderToStaticMarkup(<SettingsPage />);
    expect(html).toContain('Appearance');
    expect(html).toContain('Clear local data');
    expect(html).not.toContain('Account');
  });

  it('AC-1.6.1 shows the account details, linked providers, Sign out and Delete account when signed in', () => {
    useMe.mockReturnValue({ data: user, isPending: false });
    const html = renderToStaticMarkup(<SettingsPage />);
    expect(html).toContain('Appearance');
    expect(html).toContain('Jane Doe');
    expect(html).toContain('jane@example.com');
    expect(html).toContain('GitHub');
    expect(html).toContain('Sign out');
    expect(html).toContain('Delete account');
    expect(html).not.toContain('Clear local data');
  });

  it('AC-2.5.1 shows the Feed section to guests and users while the preferences flag is on', () => {
    features.preferences = true;
    for (const data of [null, user]) {
      useMe.mockReturnValue({ data, isPending: false });
      expect(renderToStaticMarkup(<SettingsPage />)).toContain('Feed preferences');
    }
  });

  it('AC-2.5.1 names feed preferences in the guest note only while the preferences flag is on', () => {
    useMe.mockReturnValue({ data: null, isPending: false });
    features.preferences = true;
    expect(renderToStaticMarkup(<SettingsPage />)).toContain('your saves and feed preferences');
    features.preferences = false;
    const html = renderToStaticMarkup(<SettingsPage />);
    expect(html).toContain('As a guest, your saves stay on this device.');
    expect(html).not.toContain('feed preferences');
  });

  it('AC-2.5.1 has no Feed section in the HTML while the preferences flag is off', () => {
    useMe.mockReturnValue({ data: null, isPending: false });
    expect(renderToStaticMarkup(<SettingsPage />)).not.toContain('Feed preferences');
  });
});
