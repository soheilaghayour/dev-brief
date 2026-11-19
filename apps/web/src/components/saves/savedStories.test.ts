import { describe, expect, it, vi } from 'vitest';
import type { StoryCard, StoryLookupRequest, StoryLookupResponse } from '@devbrief/shared';
import { signInHref } from './signInHref';
import { chunkIds, lookupInChunks, orderSavedStories, unavailableNotice } from './savedStories';

function story(id: string) {
  return { id } as StoryCard;
}

describe('lookupInChunks', () => {
  it('AC-1.4.3 sends no more than 100 ids per request, however many are saved', async () => {
    const ids = Array.from({ length: 250 }, (_, index) => `s${index}`);
    const lookup = vi.fn(
      async ({ ids: chunk }: StoryLookupRequest): Promise<StoryLookupResponse> => ({
        items: chunk.filter((id) => id !== 's120').map(story),
        missingIds: chunk.filter((id) => id === 's120'),
      }),
    );

    const result = await lookupInChunks(ids, lookup);

    expect(lookup.mock.calls.map(([request]) => request.ids.length)).toEqual([100, 100, 50]);
    expect(result.items).toHaveLength(249);
    expect(result.missingIds).toEqual(['s120']);
  });

  it('AC-1.4.3 sends exactly 100 ids in one request', () => {
    expect(chunkIds(Array.from({ length: 100 }, String)).map((chunk) => chunk.length)).toEqual([
      100,
    ]);
    expect(chunkIds([])).toEqual([]);
  });
});

describe('orderSavedStories', () => {
  it('AC-1.4.3 follows the saves order and skips stories that were not found', () => {
    const saves = [
      { storyId: 'b', savedAt: '2026-04-03T00:00:00.000Z' },
      { storyId: 'gone', savedAt: '2026-04-02T00:00:00.000Z' },
      { storyId: 'a', savedAt: '2026-04-01T00:00:00.000Z' },
    ];
    expect(orderSavedStories(saves, [story('a'), story('b')]).map(({ id }) => id)).toEqual([
      'b',
      'a',
    ]);
  });
});

describe('unavailableNotice', () => {
  it('AC-1.4.3 names how many saves were removed', () => {
    expect(unavailableNotice(1)).toContain('1 saved story is');
    expect(unavailableNotice(3)).toContain('3 saved stories are');
  });
});

describe('signInHref', () => {
  it('keeps the current URL, query included, in callbackURL', () => {
    expect(signInHref('/feed?tags=react&sort=latest')).toBe(
      '/sign-in?callbackURL=%2Ffeed%3Ftags%3Dreact%26sort%3Dlatest',
    );
  });
});
