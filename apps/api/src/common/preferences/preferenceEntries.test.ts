import { describe, expect, it } from 'vitest';
import { preferenceEntries } from './preferenceEntries.js';

describe('preferenceEntries', () => {
  it('flattens every list into (kind, value, mode) entries, follow first, in list order', () => {
    expect(
      preferenceEntries({
        follow: { tags: ['rust', 'react'], sources: ['hn'] },
        mute: { tags: ['career'], sources: ['devto'] },
      }),
    ).toEqual([
      { kind: 'tag', value: 'rust', mode: 'follow' },
      { kind: 'tag', value: 'react', mode: 'follow' },
      { kind: 'source', value: 'hn', mode: 'follow' },
      { kind: 'tag', value: 'career', mode: 'mute' },
      { kind: 'source', value: 'devto', mode: 'mute' },
    ]);
  });

  it('keeps one entry for a value repeated in a list', () => {
    expect(
      preferenceEntries({
        follow: { tags: ['rust', 'rust'], sources: [] },
        mute: { tags: [], sources: [] },
      }),
    ).toEqual([{ kind: 'tag', value: 'rust', mode: 'follow' }]);
  });

  it('treats the same value as a tag and as a source as two entries', () => {
    expect(
      preferenceEntries({
        follow: { tags: ['go'], sources: [] },
        mute: { tags: [], sources: ['go'] },
      }),
    ).toHaveLength(2);
  });
});
