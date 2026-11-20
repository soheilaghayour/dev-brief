import type { Preferences, StoryCard } from '@devbrief/shared';

type MutableStory = Pick<StoryCard, 'tags' | 'sources'>;

// The feed query's exclusion rule: a muted tag hides the story, muted sources only when every source is muted.
function isMuted({ tags, sources }: MutableStory, mute: Preferences['mute']) {
  if (tags.some((tag) => mute.tags.includes(tag))) return true;
  return sources.length > 0 && sources.every((source) => mute.sources.includes(source.slug));
}

/** The stories without the muted ones, for pages the server rendered without the visitor's preferences. */
export function hideMuted<T extends MutableStory>(stories: readonly T[], { mute }: Preferences) {
  return stories.filter((story) => !isMuted(story, mute));
}
