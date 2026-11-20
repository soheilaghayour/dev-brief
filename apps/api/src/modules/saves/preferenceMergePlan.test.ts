import { FEED_LIST_MAX } from '@devbrief/shared';
import { describe, expect, it } from 'vitest';
import type { PreferenceEntry } from '../../common/preferences/preferenceEntries.js';
import { planPreferenceMerge } from './preferenceMergePlan.js';

const none = { tags: [], sources: [] };

describe('planPreferenceMerge', () => {
  it('AC-2.5.3 keeps the server mode for the same (kind, value) and adds the rest', () => {
    const plan = planPreferenceMerge({
      incoming: { follow: none, mute: { tags: ['react'], sources: ['hn'] } },
      existing: [{ kind: 'tag', value: 'react', mode: 'follow' }],
    });
    expect(plan).toEqual({
      toCreate: [{ kind: 'source', value: 'hn', mode: 'mute' }],
      mergedCount: 2,
    });
  });

  it('AC-2.5.3 is idempotent: planning again over the result writes nothing and counts the same', () => {
    const incoming = { follow: { tags: ['rust' as const], sources: [] }, mute: none };
    const first = planPreferenceMerge({ incoming, existing: [] });
    const second = planPreferenceMerge({ incoming, existing: first.toCreate });
    expect(second).toEqual({ toCreate: [], mergedCount: first.mergedCount });
  });

  it('counts a value repeated in one list once', () => {
    const plan = planPreferenceMerge({
      incoming: { follow: { tags: ['rust', 'rust'], sources: [] }, mute: none },
      existing: [],
    });
    expect(plan.toCreate).toHaveLength(1);
    expect(plan.mergedCount).toBe(1);
  });

  it('treats a tag and a source of the same value as different preferences', () => {
    const plan = planPreferenceMerge({
      incoming: { follow: none, mute: { tags: [], sources: ['go'] } },
      existing: [{ kind: 'tag', value: 'go', mode: 'follow' }],
    });
    expect(plan.toCreate).toEqual([{ kind: 'source', value: 'go', mode: 'mute' }]);
  });

  it('fills a list up to FEED_LIST_MAX, then drops the rest without counting them', () => {
    const existing: PreferenceEntry[] = Array.from({ length: FEED_LIST_MAX - 1 }, (_, index) => ({
      kind: 'source',
      value: `rss-${index}`,
      mode: 'follow',
    }));
    const plan = planPreferenceMerge({
      incoming: {
        follow: { tags: [], sources: ['hn', 'devto'] },
        mute: { tags: [], sources: ['lobsters'] },
      },
      existing,
    });
    expect(plan.toCreate).toEqual([
      { kind: 'source', value: 'hn', mode: 'follow' },
      { kind: 'source', value: 'lobsters', mode: 'mute' },
    ]);
    expect(plan.mergedCount).toBe(2);
  });
});
