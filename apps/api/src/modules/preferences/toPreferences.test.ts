import { describe, expect, it } from 'vitest';
import { toPreferences } from './toPreferences.js';

describe('toPreferences', () => {
  it('groups rows by mode and kind, each list sorted', () => {
    expect(
      toPreferences([
        { kind: 'tag', value: 'rust', mode: 'follow' },
        { kind: 'source', value: 'hn', mode: 'mute' },
        { kind: 'tag', value: 'react', mode: 'follow' },
        { kind: 'source', value: 'rss-react-blog', mode: 'follow' },
        { kind: 'source', value: 'devto', mode: 'mute' },
        { kind: 'tag', value: 'career', mode: 'mute' },
      ]),
    ).toEqual({
      follow: { tags: ['react', 'rust'], sources: ['rss-react-blog'] },
      mute: { tags: ['career'], sources: ['devto', 'hn'] },
    });
  });

  it('answers empty lists for a user without rows', () => {
    expect(toPreferences([])).toEqual({
      follow: { tags: [], sources: [] },
      mute: { tags: [], sources: [] },
    });
  });

  it('drops a stored tag the taxonomy no longer has, but keeps an unknown source', () => {
    expect(
      toPreferences([
        { kind: 'tag', value: 'retired-tag', mode: 'mute' },
        { kind: 'source', value: 'rss-removed-blog', mode: 'mute' },
      ]).mute,
    ).toEqual({ tags: [], sources: ['rss-removed-blog'] });
  });
});
