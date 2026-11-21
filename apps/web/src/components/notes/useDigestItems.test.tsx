// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isoWeekRange, recentIsoWeeks, type SavedStoryPage } from '@devbrief/shared';
import { mount, storyId } from '@/components/collections/collectionsHarness';
import { useDigestItems } from './useDigestItems';

vi.mock('@/lib/auth/useMe', () => ({ useMe: () => ({ data: { id: 'u1' }, isPending: false }) }));
vi.mock('@/lib/toast/notify', () => ({ notify: vi.fn() }));
vi.mock('@/config/features', () => ({ FEATURES: {}, isFeatureEnabled: () => true }));

const server = vi.hoisted(() => ({
  pages: [] as unknown[],
  cursors: [] as (string | undefined)[],
  limits: [] as (number | undefined)[],
  failing: false,
}));
vi.mock('@/lib/api/endpoints', () => ({
  getSaveIds: async () => ({ ids: [] }),
  getSaves: async ({ cursor, limit }: { cursor?: string; limit?: number }) => {
    server.cursors.push(cursor);
    server.limits.push(limit);
    if (server.failing) throw new Error('500');
    return server.pages[cursor ? Number(cursor) : 0];
  },
}));

const week = recentIsoWeeks(new Date(), 8)[0] ?? '';
const inWeek = new Date(isoWeekRange(week).start.getTime() + 3_600_000).toISOString();
const beforeWeek = new Date(isoWeekRange(week).start.getTime() - 3_600_000).toISOString();

function item(n: number, savedAt: string, note: string | null = null) {
  return {
    story: { id: storyId(n), title: `Story ${n}`, url: `https://example.com/${n}`, tags: [] },
    savedAt,
    note,
    noteUpdatedAt: null,
  };
}

function page(items: ReturnType<typeof item>[], nextCursor: string | null) {
  return { items, nextCursor } as unknown as SavedStoryPage;
}

let unmount = () => {};
let seen: ReturnType<typeof useDigestItems> | undefined;

function Probe() {
  seen = useDigestItems([], week);
  return null;
}

beforeEach(() => {
  server.pages = [];
  server.cursors = [];
  server.limits = [];
  server.failing = false;
  seen = undefined;
});

afterEach(() => {
  unmount();
});

describe('useDigestItems for an account', () => {
  it('AC-3.4.4 reads every page back to the start of the week, not only the pages the list loaded', async () => {
    server.pages = [
      page([item(1, inWeek, 'first note'), item(2, inWeek)], '1'),
      page([item(3, inWeek, 'third note'), item(4, beforeWeek)], '2'),
      page([item(5, beforeWeek)], null),
    ];
    const mounted = await mount(<Probe />);
    unmount = mounted.unmount;

    await vi.waitFor(() => expect(seen?.isLoading).toBe(false));

    // The third page lies wholly before the week, so it isn't requested.
    expect(server.cursors).toEqual([undefined, '1']);
    expect(
      seen?.items.filter((source) => source.savedAt >= inWeek).map((source) => source.note),
    ).toEqual(['first note', null, 'third note']);
  });

  it('AC-3.4.4 stops at the last page when every save is in the week', async () => {
    server.pages = [page([item(1, inWeek)], '1'), page([item(2, inWeek)], null)];
    const mounted = await mount(<Probe />);
    unmount = mounted.unmount;

    await vi.waitFor(() => expect(seen?.items).toHaveLength(2));
    expect(server.cursors).toEqual([undefined, '1']);
  });

  it('AC-3.4.4 asks for pages of 50, the most a page can hold', async () => {
    server.pages = [page([item(1, inWeek)], null)];
    const mounted = await mount(<Probe />);
    unmount = mounted.unmount;

    await vi.waitFor(() => expect(seen?.items).toHaveLength(1));
    expect(server.limits).toEqual([50]);
  });

  it('AC-3.4.4 reports a failed load as an error, not as an empty week', async () => {
    server.failing = true;
    const mounted = await mount(<Probe />);
    unmount = mounted.unmount;

    await vi.waitFor(() => expect(seen?.isError).toBe(true));
    expect(seen?.items).toEqual([]);
  });
});
