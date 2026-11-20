import { describe, expect, it } from 'vitest';
import type { Preferences, StoryCard } from '@devbrief/shared';
import { EMPTY_PREFERENCES } from '@/lib/guest/guestState';
import { hideMuted } from './hideMuted';

function story(id: string, tags: StoryCard['tags'], sourceSlugs: string[]) {
  return { id, tags, sources: sourceSlugs.map((slug) => ({ slug })) as StoryCard['sources'] };
}

const mute = (mutes: Partial<Preferences['mute']>): Preferences => ({
  ...EMPTY_PREFERENCES,
  mute: { tags: [], sources: [], ...mutes },
});

const ids = (stories: readonly { id: string }[]) => stories.map(({ id }) => id);

describe('hideMuted', () => {
  const stories = [
    story('react-hn', ['react'], ['hn']),
    story('rust-hn-devto', ['rust'], ['hn', 'devto']),
    story('career-blog', ['career', 'rust'], ['rss-blog']),
  ];

  it('AC-2.5.2 hides every story with a muted tag', () => {
    expect(ids(hideMuted(stories, mute({ tags: ['rust'] })))).toEqual(['react-hn']);
  });

  it('AC-2.5.2 hides a story for muted sources only when every one of its sources is muted', () => {
    expect(ids(hideMuted(stories, mute({ sources: ['hn'] })))).toEqual([
      'rust-hn-devto',
      'career-blog',
    ]);
    expect(ids(hideMuted(stories, mute({ sources: ['hn', 'devto'] })))).toEqual(['career-blog']);
  });

  it('ignores follows and keeps everything without mutes', () => {
    const followOnly = { ...EMPTY_PREFERENCES, follow: { tags: ['react' as const], sources: [] } };
    expect(ids(hideMuted(stories, followOnly))).toEqual(ids(stories));
  });
});
