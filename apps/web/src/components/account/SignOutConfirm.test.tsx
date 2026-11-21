// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  byRole,
  click,
  mount,
  NoopResizeObserver,
} from '@/components/collections/collectionsHarness';
import { answerSignOut, confirmSignOut } from '@/lib/auth/signOutConfirm';
import { SignOutConfirm } from './SignOutConfirm';

let unmount = () => {};

// The dialog is a lazy chunk; load it here so the tests wait on the dialog, not on a cold import.
beforeAll(() => import('./SignOutConfirmDialog'));

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', NoopResizeObserver);
});

afterEach(() => {
  answerSignOut(false);
  unmount();
  vi.unstubAllGlobals();
});

describe('SignOutConfirm', () => {
  it('AC-1.5.8 names what has not synced, and Sign out anyway answers yes', async () => {
    const mounted = await mount(<SignOutConfirm />);
    unmount = mounted.unmount;

    const answer = confirmSignOut({ saves: 0, collections: 2, notes: 1 });
    await vi.waitFor(() => expect(byRole('button', 'Sign out anyway')).not.toBeNull());
    expect(document.body.textContent).toContain(
      '2 collections and 1 note haven’t synced to your account yet. Signing out will remove them from this device.',
    );

    await click(byRole('button', 'Sign out anyway'));
    await expect(answer).resolves.toBe(true);
  });

  it('AC-1.5.8 Stay signed in is the default answer, and closing the dialog means the same', async () => {
    const mounted = await mount(<SignOutConfirm />);
    unmount = mounted.unmount;

    const answer = confirmSignOut({ saves: 1, collections: 0, notes: 0 });
    await vi.waitFor(() => expect(byRole('button', 'Stay signed in')).not.toBeNull());
    expect(document.activeElement).toBe(byRole('button', 'Stay signed in'));

    await click(byRole('button', 'Stay signed in'));
    await expect(answer).resolves.toBe(false);
  });
});
