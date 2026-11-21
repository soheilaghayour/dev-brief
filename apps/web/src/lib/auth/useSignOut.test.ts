import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const queryClient = new QueryClient();
const authClient = vi.hoisted(() => ({ signOut: vi.fn() }));
const clearGuestData = vi.hoisted(() => vi.fn());
const runMerge = vi.hoisted(() => vi.fn());
const guest = vi.hoisted(() => ({
  pendingMerge: false,
  saves: [] as unknown[],
  collections: [] as unknown[],
  notes: {} as Record<string, unknown>,
}));
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQueryClient: () => queryClient,
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));
vi.mock('@/lib/guest/clear', () => ({ clearGuestData }));
vi.mock('@/lib/guest/guestSaves', () => ({ latestGuestData: async () => guest }));
vi.mock('@/components/saves/runMerge', () => ({ runMerge }));
vi.mock('./authClient', () => ({ authClient }));

const { useSignOut } = await import('./useSignOut');
const { answerSignOut, useSignOutConfirm } = await import('./signOutConfirm');

beforeEach(() => {
  authClient.signOut.mockReset().mockResolvedValue({ error: null });
  clearGuestData.mockReset();
  runMerge.mockReset().mockResolvedValue(undefined);
  guest.pendingMerge = false;
  guest.saves = [];
  guest.collections = [];
  guest.notes = {};
  answerSignOut(false);
});

describe('useSignOut', () => {
  it('AC-2.5.3 drops the account preferences, saves and collections from the cache, so the next sign-in cannot see them', async () => {
    queryClient.setQueryData(['me'], { id: 'u1' });
    queryClient.setQueryData(['prefs'], { follow: { tags: ['rust'], sources: [] } });
    queryClient.setQueryData(['saves'], ['a']);
    queryClient.setQueryData(['collections'], { items: [] });
    queryClient.setQueryData(['collections', 'c1'], { items: [] });

    useSignOut()();
    await vi.waitFor(() => expect(queryClient.getQueryData(['me'])).toBeNull());

    expect(queryClient.getQueryData(['prefs'])).toBeUndefined();
    expect(queryClient.getQueryData(['saves'])).toBeUndefined();
    expect(queryClient.getQueryData(['collections'])).toBeUndefined();
    expect(queryClient.getQueryData(['collections', 'c1'])).toBeUndefined();
    expect(clearGuestData).toHaveBeenCalled();
  });

  it('AC-1.5.8 waits for a merge in flight before it signs out', async () => {
    let finishMerge = () => {};
    runMerge.mockReturnValue(
      new Promise<void>((resolve) => {
        finishMerge = resolve;
      }),
    );

    useSignOut()();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(authClient.signOut).not.toHaveBeenCalled();

    finishMerge();
    await vi.waitFor(() => expect(authClient.signOut).toHaveBeenCalled());
  });

  describe('when a merge failed and the account lacks some of the device data', () => {
    beforeEach(() => {
      guest.pendingMerge = true;
      guest.collections = [{ slug: 'reading' }, { slug: 'later' }];
      guest.notes = { a: {} };
    });

    it('AC-1.5.8 retries the merge once, then asks, and Stay signed in keeps everything', async () => {
      useSignOut()();
      await vi.waitFor(() => expect(useSignOutConfirm.getState().unsynced).not.toBeNull());

      expect(runMerge).toHaveBeenCalledTimes(2);
      expect(useSignOutConfirm.getState().unsynced).toEqual({
        saves: 0,
        collections: 2,
        notes: 1,
      });
      answerSignOut(false);
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(authClient.signOut).not.toHaveBeenCalled();
      expect(clearGuestData).not.toHaveBeenCalled();
    });

    it('AC-1.5.8 Sign out anyway signs out and empties the device store', async () => {
      useSignOut()();
      await vi.waitFor(() => expect(useSignOutConfirm.getState().unsynced).not.toBeNull());

      answerSignOut(true);

      await vi.waitFor(() => expect(clearGuestData).toHaveBeenCalled());
      expect(authClient.signOut).toHaveBeenCalled();
    });

    it('AC-1.5.8 asks nothing when the retry brought the account up to date', async () => {
      runMerge.mockImplementation(async () => {
        guest.pendingMerge = false;
      });

      useSignOut()();

      await vi.waitFor(() => expect(clearGuestData).toHaveBeenCalled());
      expect(useSignOutConfirm.getState().unsynced).toBeNull();
    });
  });
});
