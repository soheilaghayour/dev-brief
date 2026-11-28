import { describe, expect, it } from 'vitest';
import { FEED_LIST_MAX } from '@devbrief/shared';
import { EMPTY_PREFERENCES } from './guestState';
import { modeOf, setPreferences, withoutPreferences } from './preferenceModes';

const prefs = {
  follow: { tags: ['rust' as const], sources: ['hn'] },
  mute: { tags: ['career' as const], sources: [] },
};

describe('setPreferences', () => {
  it('AC-2.5.1 follows and mutes a tag or a source', () => {
    expect(setPreferences(EMPTY_PREFERENCES, 'tag', ['react'], 'follow')).toEqual({
      outcome: 'changed',
      prefs: { ...EMPTY_PREFERENCES, follow: { tags: ['react'], sources: [] } },
    });
    expect(setPreferences(EMPTY_PREFERENCES, 'source', ['devto'], 'mute').prefs).toEqual({
      ...EMPTY_PREFERENCES,
      mute: { tags: [], sources: ['devto'] },
    });
  });

  it('AC-2.5.1 following removes a mute of the same value, and muting removes a follow', () => {
    expect(setPreferences(prefs, 'tag', ['career'], 'follow').prefs).toEqual({
      follow: { tags: ['rust', 'career'], sources: ['hn'] },
      mute: { tags: [], sources: [] },
    });
    expect(setPreferences(prefs, 'source', ['hn'], 'mute').prefs).toEqual({
      follow: { tags: ['rust'], sources: [] },
      mute: { tags: ['career'], sources: ['hn'] },
    });
  });

  it('AC-2.5.1 null clears the value from both lists and leaves the other kind alone', () => {
    expect(setPreferences(prefs, 'tag', ['rust'], null).prefs).toEqual({
      follow: { tags: [], sources: ['hn'] },
      mute: { tags: ['career'], sources: [] },
    });
  });

  it('keeps one entry when a value is set to the mode it already has', () => {
    expect(setPreferences(prefs, 'tag', ['rust'], 'follow').prefs).toEqual(prefs);
  });

  it('refuses a new value for a full list, which would no longer fit the feed params', () => {
    const full = {
      ...EMPTY_PREFERENCES,
      mute: {
        tags: [],
        sources: Array.from({ length: FEED_LIST_MAX }, (_, index) => `blog-${index}`),
      },
    };
    expect(setPreferences(full, 'source', ['hn'], 'mute')).toEqual({
      outcome: 'full',
      prefs: full,
    });
    expect(setPreferences(full, 'source', ['blog-3'], 'mute').outcome).toBe('changed');
    expect(setPreferences(full, 'source', ['hn'], 'follow').outcome).toBe('changed');
  });
});

describe('setPreferences for several values', () => {
  const room = FEED_LIST_MAX - 2;
  const nearlyFull = {
    ...EMPTY_PREFERENCES,
    mute: { tags: [], sources: Array.from({ length: room }, (_, index) => `blog-${index}`) },
  };

  it('AC-2.5.1 sets every value, moving each out of the other list', () => {
    const next = setPreferences(prefs, 'source', ['hn', 'devto'], 'mute').prefs;
    expect(next.mute.sources).toEqual(['hn', 'devto']);
    expect(next.follow.sources).toEqual([]);
  });

  it('AC-2.5.1 sets all of them or none when the list would pass its cap', () => {
    expect(setPreferences(nearlyFull, 'source', ['a', 'b'], 'mute').outcome).toBe('changed');
    const refused = setPreferences(nearlyFull, 'source', ['a', 'b', 'c'], 'mute');
    expect(refused).toEqual({ outcome: 'full', prefs: nearlyFull });
  });

  it('AC-2.5.1 counts only the values that are not in the list yet', () => {
    expect(setPreferences(nearlyFull, 'source', ['blog-0', 'a', 'b'], 'mute').outcome).toBe(
      'changed',
    );
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

describe('withoutPreferences', () => {
  it('AC-2.5.3 drops the sent entries and keeps what the device gained meanwhile', () => {
    const current = {
      follow: { tags: ['rust' as const, 'go' as const], sources: ['hn'] },
      mute: { tags: ['career' as const], sources: [] },
    };
    expect(withoutPreferences(current, prefs)).toEqual({
      follow: { tags: ['go'], sources: [] },
      mute: { tags: [], sources: [] },
    });
  });
});
