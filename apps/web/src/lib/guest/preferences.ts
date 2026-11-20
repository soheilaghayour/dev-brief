import type { FeedQuery, Preferences, TagSlug } from '@devbrief/shared';

export type PreferenceKind = 'tag' | 'source';
export type PreferenceMode = 'follow' | 'mute';
/** The value each kind holds: a tag slug, or a source slug. */
export type PreferenceValue = { tag: TagSlug; source: string };
export type PersonalFeedParams = Pick<
  Partial<FeedQuery>,
  'excludeTags' | 'excludeSources' | 'boostTags' | 'boostSources'
>;

/** The feed params of a preference set; empty lists are left out, so no preferences give the public query. */
export function toFeedParams({ follow, mute }: Preferences): PersonalFeedParams {
  return {
    ...(mute.tags.length > 0 && { excludeTags: mute.tags }),
    ...(mute.sources.length > 0 && { excludeSources: mute.sources }),
    ...(follow.tags.length > 0 && { boostTags: follow.tags }),
    ...(follow.sources.length > 0 && { boostSources: follow.sources }),
  };
}
