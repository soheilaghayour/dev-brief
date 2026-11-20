import { describe, expect, it } from 'vitest';
import { FEED_LIST_MAX } from '@devbrief/shared';
import { EMPTY_PREFERENCES } from './guestState';
import { modeOf, setPreference } from './preferenceModes';

const prefs = {
  follow: { tags: ['rust' as const], sources: ['hn'] },
  mute: { tags: ['career' as const], sources: [] },
};

describe('setPreference', () => {
  it('AC-2.5.1 follows and mutes a tag or a source', () => {
    expect(setPreference(EMPTY_PREFERENCES, 'tag', 'react', 'follow')).toEqual({
      outcome: 'changed',
      prefs: { ...EMPTY_PREFERENCES, follow: { tags: ['react'], sources: [] } },
    });
    expect(setPreference(EMPTY_PREFERENCES, 'source', 'devto', 'mute').prefs).toEqual({
      ...EMPTY_PREFERENCES,
      mute: { tags: [], sources: ['devto'] },
    });
  });

  it('AC-2.5.1 following removes a mute of the same value, and muting removes a follow', () => {
    expect(setPreference(prefs, 'tag', 'career', 'follow').prefs).toEqual({
      follow: { tags: ['rust', 'career'], sources: ['hn'] },
      mute: { tags: [], sources: [] },
    });
    expect(setPreference(prefs, 'source', 'hn', 'mute').prefs).toEqual({
      follow: { tags: ['rust'], sources: [] },
      mute: { tags: ['career'], sources: ['hn'] },
    });
  });

  it('AC-2.5.1 null clears the value from both lists and leaves the other kind alone', () => {
    expect(setPreference(prefs, 'tag', 'rust', null).prefs).toEqual({
      follow: { tags: [], sources: ['hn'] },
      mute: { tags: ['career'], sources: [] },
    });
  });

  it('keeps one entry when a value is set to the mode it already has', () => {
    expect(setPreference(prefs, 'tag', 'rust', 'follow').prefs).toEqual(prefs);
  });

  it('refuses a new value for a full list, which would no longer fit the feed params', () => {
    const full = {
      ...EMPTY_PREFERENCES,
      mute: {
        tags: [],
        sources: Array.from({ length: FEED_LIST_MAX }, (_, index) => `blog-${index}`),
      },
    };
    expect(setPreference(full, 'source', 'hn', 'mute')).toEqual({ outcome: 'full', prefs: full });
    expect(setPreference(full, 'source', 'blog-3', 'mute').outcome).toBe('changed');
    expect(setPreference(full, 'source', 'hn', 'follow').outcome).toBe('changed');
  });
});

describe('modeOf', () => {
  it('AC-2.5.1 reads follow, mute or neither', () => {
    expect(modeOf(prefs, 'tag', 'rust')).toBe('follow');
    expect(modeOf(prefs, 'tag', 'career')).toBe('mute');
    expect(modeOf(prefs, 'source', 'hn')).toBe('follow');
    expect(modeOf(prefs, 'tag', 'react')).toBeNull();
  });
});
