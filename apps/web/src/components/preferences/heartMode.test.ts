import { describe, expect, it } from 'vitest';
import { EMPTY_PREFERENCES } from '@/lib/guest/guestState';
import { kindMode, nextMode } from './heartMode';

const prefs = {
  follow: { tags: [], sources: ['hn', 'blog-a'] },
  mute: { tags: [], sources: ['blog-b'] },
};

describe('nextMode', () => {
  it('AC-2.5.1 cycles none → followed → muted → none', () => {
    expect(nextMode(null)).toBe('follow');
    expect(nextMode('follow')).toBe('mute');
    expect(nextMode('mute')).toBeNull();
  });
});

describe('kindMode', () => {
  it('AC-2.5.1 shows followed or muted when every source of the kind is', () => {
    expect(kindMode(prefs, ['hn'])).toBe('follow');
    expect(kindMode(prefs, ['blog-b'])).toBe('mute');
    expect(kindMode(prefs, ['hn', 'blog-a'])).toBe('follow');
  });

  it('AC-2.5.1 shows neither when the kind has no sources or none is set', () => {
    expect(kindMode(prefs, [])).toBeNull();
    expect(kindMode(EMPTY_PREFERENCES, ['hn', 'blog-a'])).toBeNull();
  });

  it('AC-2.5.1 shows neither for a kind with two sources in mixed states, and a click from there follows both', () => {
    const mixed = ['blog-a', 'blog-b'];
    expect(kindMode(prefs, mixed)).toBeNull();
    expect(nextMode(kindMode(prefs, mixed))).toBe('follow');
  });
});
