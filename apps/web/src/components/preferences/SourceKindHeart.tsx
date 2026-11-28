'use client';

import { useQuery } from '@tanstack/react-query';
import type { SourceKind } from '@devbrief/shared';
import { sourcesQueryOptions } from '@/components/feed/feedQueries';
import { SOURCE_KIND_LABELS } from '@/components/feed/sourceKinds';
import type { PreferenceMode } from '@/lib/guest/preferences';
import { FollowMuteHeart } from './FollowMuteHeart';
import { kindMode } from './heartMode';
import { usePreferences } from './usePreferences';

/** The heart of a source kind: preferences are stored per source, so a click sets the next state on every source of the kind at once. */
export function SourceKindHeart({ kind }: { kind: SourceKind }) {
  const { data } = useQuery(sourcesQueryOptions);
  const { isReady, prefs, setModes } = usePreferences();
  const slugs = (data?.sources ?? [])
    .filter((source) => source.kind === kind)
    .map((source) => source.slug);

  function change(mode: PreferenceMode | null) {
    setModes('source', slugs, mode);
  }

  return (
    <FollowMuteHeart
      label={SOURCE_KIND_LABELS[kind]}
      mode={isReady ? kindMode(prefs, slugs) : null}
      onChange={change}
      disabled={!isReady || slugs.length === 0}
    />
  );
}
