// @vitest-environment jsdom
import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MergeRequest, MergeResponse } from '@devbrief/shared';

const mergeSaves = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api/endpoints', () => ({ mergeSaves }));
const notify = vi.hoisted(() => vi.fn());
vi.mock('@/lib/toast/notify', () => ({ notify }));
vi.mock('@/config/features', () => ({ isFeatureEnabled: () => true }));

const { mergeGuestData } = await import('./mergeGuestData');
const { latestGuestData } = await import('@/lib/guest/guestSaves');
const { useGuestStore } = await import('@/lib/guest/guestStore');
const { hydrateGuestStore } = await import('@/lib/guest/hydrateGuestStore');
const { clearGuestData } = await import('@/lib/guest/clear');

const SAVED_AT = '2026-05-01T10:00:00.000Z';
const NOTE_AT = '2026-05-02T10:00:00.000Z';
const story = (n: number) => `c${String(n).padStart(24, '0')}`;

function response(overrides: {
  merged?: Partial<MergeResponse['merged']>;
  skipped?: Partial<MergeResponse['skipped']>;
}): MergeResponse {
  return {
    merged: { saves: 0, preferences: 0, collections: 0, notes: 0, ...overrides.merged },
    skipped: { saves: 0, notes: 0, collections: 0, items: 0, ...overrides.skipped },
    missingStoryIds: [],
  };
}

async function seedBoardsAndNotes() {
  await hydrateGuestStore();
  useGuestStore.getState().reset();
  useGuestStore.setState({
    saves: [{ storyId: story(1), savedAt: SAVED_AT }],
    collections: [
      {
        id: 'local-1',
        slug: 'reading',
        name: 'Reading',
        description: null,
        position: 0,
        items: [{ storyId: story(1), position: 0, addedAt: SAVED_AT }],
      },
    ],
    notes: { [story(1)]: { note: 'my note', updatedAt: NOTE_AT } },
  });
}

beforeEach(async () => {
  mergeSaves.mockReset();
  notify.mockReset();
  await seedBoardsAndNotes();
});

describe('mergeGuestData collections and notes', () => {
  it('AC-3.4.5 sends the boards and the notes with the saves', async () => {
    mergeSaves.mockResolvedValue(response({ merged: { saves: 1, collections: 1, notes: 1 } }));

    await mergeGuestData(new QueryClient());

    expect(mergeSaves).toHaveBeenCalledTimes(1);
    expect(mergeSaves.mock.calls[0]?.[0]).toEqual({
      version: 1,
      saves: [{ storyId: story(1), savedAt: SAVED_AT }],
      collections: [
        { slug: 'reading', name: 'Reading', items: [{ storyId: story(1), position: 0 }] },
      ],
      notes: [{ storyId: story(1), note: 'my note', updatedAt: NOTE_AT }],
    });
  });

  it('AC-3.4.5 keeps boards, notes and saves until the server confirms, and releases them after', async () => {
    let duringRequest: Awaited<ReturnType<typeof latestGuestData>> | undefined;
    mergeSaves.mockImplementation(async () => {
      duringRequest = await latestGuestData();
      return response({ merged: { saves: 1, collections: 1, notes: 1 } });
    });

    await mergeGuestData(new QueryClient());

    expect(duringRequest?.collections).toHaveLength(1);
    expect(Object.keys(duringRequest?.notes ?? {})).toEqual([story(1)]);
    expect(duringRequest?.saves).toHaveLength(1);
    const after = await latestGuestData();
    expect(after.collections).toEqual([]);
    expect(after.notes).toEqual({});
    expect(after.saves).toEqual([]);
    expect(after.pendingMerge).toBe(false);
  });

  it('AC-3.4.5 a failed request keeps everything and sets pendingMerge, and the retry sends the same data', async () => {
    mergeSaves.mockRejectedValueOnce(new Error('offline'));
    await mergeGuestData(new QueryClient());

    const kept = await latestGuestData();
    expect(kept.collections).toHaveLength(1);
    expect(Object.keys(kept.notes)).toEqual([story(1)]);
    expect(kept.saves).toHaveLength(1);
    expect(kept.pendingMerge).toBe(true);
    expect(notify).not.toHaveBeenCalled();

    mergeSaves.mockResolvedValue(response({ merged: { saves: 1, collections: 1, notes: 1 } }));
    await mergeGuestData(new QueryClient());

    expect(mergeSaves).toHaveBeenCalledTimes(2);
    expect(mergeSaves.mock.calls[1]?.[0]).toEqual(mergeSaves.mock.calls[0]?.[0]);
    expect((await latestGuestData()).collections).toEqual([]);
  });

  it('AC-3.4.5 a load after a confirmed merge sends nothing, so the merge is not repeated', async () => {
    mergeSaves.mockResolvedValue(response({ merged: { saves: 1, collections: 1, notes: 1 } }));
    await mergeGuestData(new QueryClient());
    await mergeGuestData(new QueryClient());
    expect(mergeSaves).toHaveBeenCalledTimes(1);
  });

  it('AC-3.4.5 sends a note whose story is no longer in the saves, as after an earlier confirmed merge', async () => {
    useGuestStore.setState({ saves: [] });
    mergeSaves.mockResolvedValue(response({ merged: { notes: 1 } }));

    await mergeGuestData(new QueryClient());

    const request = mergeSaves.mock.calls[0]?.[0] as MergeRequest;
    expect(request.saves).toEqual([]);
    expect(request.notes?.map((note) => note.storyId)).toEqual([story(1)]);
    expect((await latestGuestData()).notes).toEqual({});
  });

  it('AC-3.4.5 a note changed while the request was out stays for the next merge', async () => {
    mergeSaves.mockImplementation(async () => {
      useGuestStore.setState({
        notes: { [story(1)]: { note: 'edited meanwhile', updatedAt: '2026-05-03T10:00:00.000Z' } },
      });
      return response({ merged: { saves: 1, collections: 1, notes: 1 } });
    });

    await mergeGuestData(new QueryClient());

    const after = await latestGuestData();
    expect(after.notes[story(1)]?.note).toBe('edited meanwhile');
    expect(after.collections).toEqual([]);
  });

  it('AC-3.4.5 releases a skipped note too, and tells why', async () => {
    mergeSaves.mockResolvedValue(
      response({ merged: { saves: 1, collections: 1 }, skipped: { notes: 1 } }),
    );

    await mergeGuestData(new QueryClient());

    expect((await latestGuestData()).notes).toEqual({});
    expect(notify).toHaveBeenCalledWith('1 saved story and 1 collection synced');
    expect(notify).toHaveBeenCalledWith(
      "1 note couldn't be merged: together with the account's note it is over 20,000 characters",
    );
  });

  it('AC-3.4.5 reports collections and stories past the limits, and releases them', async () => {
    mergeSaves.mockResolvedValue(
      response({ merged: { saves: 1 }, skipped: { collections: 1, items: 2 } }),
    );

    await mergeGuestData(new QueryClient());

    expect((await latestGuestData()).collections).toEqual([]);
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('1 collection couldn'));
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('2 stories couldn'));
  });

  it('AC-3.4.5 the toast counts saves, collections and notes', async () => {
    mergeSaves.mockResolvedValue(response({ merged: { saves: 3, collections: 2, notes: 1 } }));
    await mergeGuestData(new QueryClient());
    expect(notify).toHaveBeenCalledWith('3 saved stories, 2 collections and 1 note synced');
  });

  it('AC-3.4.5 splits the notes over several requests, keeps what a failed one carried, and finishes on the next load', async () => {
    useGuestStore.setState({
      notes: Object.fromEntries(
        Array.from({ length: 30 }, (_, index) => [
          story(100 + index),
          { note: 'x'.repeat(20_000), updatedAt: NOTE_AT },
        ]),
      ),
    });
    mergeSaves.mockResolvedValueOnce(response({ merged: { saves: 1, collections: 1, notes: 20 } }));
    mergeSaves.mockRejectedValueOnce(new Error('offline'));

    await mergeGuestData(new QueryClient());

    expect(mergeSaves).toHaveBeenCalledTimes(2);
    const first = mergeSaves.mock.calls[0]?.[0] as MergeRequest;
    const second = mergeSaves.mock.calls[1]?.[0] as MergeRequest;
    expect(first.saves).toHaveLength(1);
    expect(second.saves).toEqual([]);
    for (const request of [first, second]) {
      expect(new TextEncoder().encode(JSON.stringify(request)).length).toBeLessThan(512 * 1024);
    }
    const held = await latestGuestData();
    // The first request was confirmed, so its saves, boards and notes are released; the second one's notes stay.
    expect(held.saves).toEqual([]);
    expect(held.collections).toEqual([]);
    expect(Object.keys(held.notes).sort()).toEqual(
      (second.notes ?? []).map((note) => note.storyId).sort(),
    );
    expect(held.pendingMerge).toBe(true);
    expect(notify).toHaveBeenCalledWith('1 saved story, 1 collection and 20 notes synced');

    mergeSaves.mockResolvedValue(response({ merged: { notes: 10 } }));
    await mergeGuestData(new QueryClient());

    const retry = mergeSaves.mock.calls[2]?.[0] as MergeRequest;
    expect(retry.notes).toEqual(second.notes);
    const done = await latestGuestData();
    expect(done.notes).toEqual({});
    expect(done.pendingMerge).toBe(false);
  });

  it('AC-3.4.5 signing in and then out loses nothing: everything was in a confirmed request before the device cleared', async () => {
    const sent: MergeRequest[] = [];
    mergeSaves.mockImplementation(async (request: MergeRequest) => {
      sent.push(request);
      return response({ merged: { saves: 1, collections: 1, notes: 1 } });
    });

    await mergeGuestData(new QueryClient());
    clearGuestData();

    expect(sent[0]?.collections?.[0]?.slug).toBe('reading');
    expect(sent[0]?.notes?.[0]?.note).toBe('my note');
    expect(sent[0]?.saves[0]?.storyId).toBe(story(1));
  });
});
