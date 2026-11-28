'use client';

import { TAG_LABELS, type TagSlug } from '@devbrief/shared';
import type { PreferenceMode } from '@/lib/guest/preferences';
import { FollowMuteHeart } from './FollowMuteHeart';
import { usePreferences } from './usePreferences';

/** The heart of a tag, read and changed through the preferences hook. */
export function TagHeart({ slug }: { slug: TagSlug }) {
  const { isReady, modeOf, setMode } = usePreferences();

  function change(mode: PreferenceMode | null) {
    setMode('tag', slug, mode);
  }

  return (
    <FollowMuteHeart
      label={TAG_LABELS[slug]}
      mode={isReady ? modeOf('tag', slug) : null}
      onChange={change}
      disabled={!isReady}
    />
  );
}
