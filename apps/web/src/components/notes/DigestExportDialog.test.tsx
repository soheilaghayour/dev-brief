// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { byRole, mount, NoopResizeObserver } from '@/components/collections/collectionsHarness';
import { DigestExportDialog } from './DigestExportDialog';

vi.mock('@/lib/auth/useMe', () => ({ useMe: () => ({ data: { id: 'u1' }, isPending: false }) }));
vi.mock('@/lib/toast/notify', () => ({ notify: vi.fn() }));
vi.mock('@/config/features', () => ({ FEATURES: {}, isFeatureEnabled: () => true }));
const server = vi.hoisted(() => ({ failing: false }));
vi.mock('@/lib/api/endpoints', () => ({
  getSaveIds: async () => ({ ids: [] }),
  getCollections: async () => ({ items: [] }),
  getSaves: async () => {
    if (server.failing) throw new Error('500');
    return { items: [], nextCursor: null };
  },
}));

let unmount = () => {};

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', NoopResizeObserver);
  server.failing = false;
});

afterEach(() => {
  unmount();
  vi.unstubAllGlobals();
});

async function showDialog() {
  const mounted = await mount(<DigestExportDialog stories={[]} onClose={() => {}} />);
  unmount = mounted.unmount;
}

describe('DigestExportDialog for an account', () => {
  it('AC-3.4.4 a failed load disables Download and Copy and says so, instead of exporting an empty week', async () => {
    server.failing = true;
    await showDialog();

    await vi.waitFor(() => expect(document.querySelector('[role="alert"]')).not.toBeNull());
    expect(byRole('button', 'Download .md')?.hasAttribute('disabled')).toBe(true);
    expect(byRole('button', 'Copy to clipboard')?.hasAttribute('disabled')).toBe(true);
  });

  it('AC-3.4.4 enables both buttons once the saves have loaded', async () => {
    await showDialog();

    await vi.waitFor(() =>
      expect(byRole('button', 'Download .md')?.hasAttribute('disabled')).toBe(false),
    );
    expect(document.querySelector('[role="alert"]')).toBeNull();
  });
});
