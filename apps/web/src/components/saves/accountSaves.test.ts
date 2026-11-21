import { MutationObserver, QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import type { SavedStoryPage, StoryCard } from '@devbrief/shared';
import { ApiError } from '@/lib/api/apiError';
import {
  patchSaveIds,
  patchSavedList,
  SAVE_BUSY_NOTICE,
  SAVE_FAILED_NOTICE,
  SAVE_IDS_KEY,
  SAVE_LIST_KEY,
  saveMutationOptions,
} from './accountSaves';

const card = (id: string) => ({ id }) as StoryCard;
const page = (...ids: string[]): SavedStoryPage => ({
  items: ids.map((id) => ({ story: card(id), savedAt: '2026-05-01T10:00:00.000Z' })),
  nextCursor: null,
});
const list = (...pages: SavedStoryPage[]) => ({ pages, pageParams: pages.map(() => undefined) });

describe('patchSaveIds', () => {
  it('puts a new save first and removes an unsave', () => {
    expect(patchSaveIds({ ids: ['a'] }, { storyId: 'b', save: true })).toEqual({ ids: ['b', 'a'] });
    expect(patchSaveIds({ ids: ['b', 'a'] }, { storyId: 'b', save: false })).toEqual({
      ids: ['a'],
    });
  });

  it('leaves ids that are not loaded yet alone', () => {
    expect(patchSaveIds(undefined, { storyId: 'b', save: true })).toBeUndefined();
  });
});

describe('patchSavedList', () => {
  it('removes an unsaved story from every page and ignores a new save', () => {
    const data = list(page('a', 'b'), page('c'));
    expect(
      patchSavedList(data, { storyId: 'b', save: false })?.pages.map((p) => p.items.length),
    ).toEqual([1, 1]);
    expect(patchSavedList(data, { storyId: 'x', save: true })).toBe(data);
  });
});

describe('saveMutationOptions', () => {
  const never = () => Promise.reject(new Error('unused'));

  function setup(requests: { putSave?: () => Promise<never>; deleteSave?: () => Promise<void> }) {
    const queryClient = new QueryClient();
    queryClient.setQueryData(SAVE_IDS_KEY, { ids: ['a'] });
    queryClient.setQueryData(SAVE_LIST_KEY, list(page('a')));
    const notify = vi.fn();
    const deleteSave = vi.fn(requests.deleteSave ?? never);
    const observer = new MutationObserver(
      queryClient,
      saveMutationOptions(queryClient, { putSave: requests.putSave ?? never, deleteSave, notify }),
    );
    return { queryClient, notify, deleteSave, observer };
  }

  it('AC-1.5.4 patches the ids at once, then rolls back and shows the toast when the request fails', async () => {
    let fail: (error: Error) => void = () => {};
    const { queryClient, notify, observer } = setup({
      putSave: () => new Promise((_resolve, reject) => (fail = reject)),
    });

    const settled = observer.mutate({ storyId: 'b', save: true }).catch(() => undefined);
    await vi.waitFor(() =>
      expect(queryClient.getQueryData(SAVE_IDS_KEY)).toEqual({ ids: ['b', 'a'] }),
    );

    fail(new Error('500'));
    await settled;
    expect(queryClient.getQueryData(SAVE_IDS_KEY)).toEqual({ ids: ['a'] });
    expect(notify).toHaveBeenCalledWith("Couldn't save — retry");
  });

  it('AC-1.5.4 puts a failed unsave back into the saved list', async () => {
    const { queryClient, notify, observer } = setup({
      deleteSave: () => Promise.reject(new Error('500')),
    });
    await observer.mutate({ storyId: 'a', save: false }).catch(() => undefined);
    expect(queryClient.getQueryData(SAVE_IDS_KEY)).toEqual({ ids: ['a'] });
    expect(
      queryClient.getQueryData<ReturnType<typeof list>>(SAVE_LIST_KEY)?.pages[0]?.items,
    ).toHaveLength(1);
    expect(notify).toHaveBeenCalledWith(SAVE_FAILED_NOTICE);
  });

  it('AC-1.5.4 sends DELETE for an unsave and refetches both keys once it settles', async () => {
    const { queryClient, deleteSave, observer } = setup({ deleteSave: () => Promise.resolve() });
    await observer.mutate({ storyId: 'a', save: false });
    expect(deleteSave).toHaveBeenCalledWith('a');
    expect(queryClient.getQueryState(SAVE_IDS_KEY)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(SAVE_LIST_KEY)?.isInvalidated).toBe(true);
  });

  it('AC-3.4.1 an unsave refetches the collections, since the server removed the story from every board, and forgets its note', async () => {
    const { queryClient, observer } = setup({ deleteSave: () => Promise.resolve() });
    queryClient.setQueryData(['collections'], { items: [] });
    queryClient.setQueryData(['collections', 'c1'], { collection: {}, items: [] });
    queryClient.setQueryData(['saves', 'note', 'a'], { storyId: 'a' });

    await observer.mutate({ storyId: 'a', save: false });

    expect(queryClient.getQueryState(['collections'])?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(['collections', 'c1'])?.isInvalidated).toBe(true);
    expect(queryClient.getQueryData(['saves', 'note', 'a'])).toBeUndefined();
  });

  it('a save leaves the collections alone', async () => {
    const { queryClient, observer } = setup({ putSave: () => Promise.resolve(undefined as never) });
    queryClient.setQueryData(['collections'], { items: [] });

    await observer.mutate({ storyId: 'b', save: true });

    expect(queryClient.getQueryState(['collections'])?.isInvalidated).toBe(false);
  });

  it('AC-1.5.4 sends a quick save then unsave in order, so the server ends on the last intent', async () => {
    let finishPut: () => void = () => {};
    const putSave = vi.fn(
      () => new Promise<never>((resolve) => (finishPut = () => resolve(undefined as never))),
    );
    const { deleteSave, observer } = setup({ putSave, deleteSave: () => Promise.resolve() });

    const put = observer.mutate({ storyId: 'b', save: true });
    const del = observer.mutate({ storyId: 'b', save: false });
    await vi.waitFor(() => expect(putSave).toHaveBeenCalledWith('b'));
    expect(deleteSave).not.toHaveBeenCalled();

    finishPut();
    await Promise.all([put, del]);
    expect(deleteSave).toHaveBeenCalledWith('b');
  });
});

describe('saveMutationOptions on a busy account lock', () => {
  const busy = () => new ApiError('CONFLICT', 'busy', 'req', 409, undefined);

  function setup(deleteSave: () => Promise<void>) {
    const queryClient = new QueryClient();
    queryClient.setQueryData(SAVE_IDS_KEY, { ids: ['a'] });
    const notify = vi.fn();
    const observer = new MutationObserver(
      queryClient,
      saveMutationOptions(queryClient, {
        putSave: () => Promise.reject(new Error('unused')),
        deleteSave: vi.fn(deleteSave),
        notify,
      }),
    );
    return { queryClient, notify, observer };
  }

  it('AC-1.5.4 sends the request again after 250 ms and 500 ms before it gives up', async () => {
    vi.useFakeTimers();
    try {
      let attempts = 0;
      const { notify, observer } = setup(async () => {
        attempts += 1;
        if (attempts < 3) throw busy();
      });

      const done = observer.mutate({ storyId: 'a', save: false });
      await vi.advanceTimersByTimeAsync(750);
      await done;

      expect(attempts).toBe(3);
      expect(notify).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('AC-1.5.4 a lock that stays busy rolls back and says the account is busy syncing', async () => {
    vi.useFakeTimers();
    try {
      const { queryClient, notify, observer } = setup(() => Promise.reject(busy()));

      const done = observer.mutate({ storyId: 'a', save: false }).catch(() => undefined);
      await vi.advanceTimersByTimeAsync(750);
      await done;

      expect(notify).toHaveBeenCalledWith(SAVE_BUSY_NOTICE);
      expect(queryClient.getQueryData(SAVE_IDS_KEY)).toEqual({ ids: ['a'] });
    } finally {
      vi.useRealTimers();
    }
  });
});
