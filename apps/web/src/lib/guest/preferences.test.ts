import { describe, expect, it } from 'vitest';
import { EMPTY_PREFERENCES } from './guestState';
import { toFeedParams } from './preferences';

const prefs = {
  follow: { tags: ['rust' as const], sources: ['hn'] },
  mute: { tags: ['career' as const], sources: [] },
};

describe('toFeedParams', () => {
  it('AC-2.5.2 mutes become exclude params and follows become boost params', () => {
    expect(
      toFeedParams({
        follow: { tags: ['rust'], sources: ['hn'] },
        mute: { tags: ['career'], sources: ['devto'] },
      }),
    ).toEqual({
      excludeTags: ['career'],
      excludeSources: ['devto'],
      boostTags: ['rust'],
      boostSources: ['hn'],
    });
  });

  it('AC-2.5.2 leaves empty lists out, so no preferences give the public feed query', () => {
    expect(toFeedParams(EMPTY_PREFERENCES)).toEqual({});
    expect(toFeedParams(prefs)).toEqual({
      excludeTags: ['career'],
      boostTags: ['rust'],
      boostSources: ['hn'],
    });
  });
});
