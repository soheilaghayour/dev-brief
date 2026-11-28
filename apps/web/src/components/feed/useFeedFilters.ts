'use client';

import { useCallback, useMemo } from 'react';
import { useQueryStates } from 'nuqs';
import type { SourceKind, TagSlug } from '@devbrief/shared';
import { feedSearchParams, toFeedFilters, toggleValue } from './feedParams';

// Filter changes replace the history entry, so Back leaves the feed instead of stepping through filters.
const URL_OPTIONS = { history: 'replace' } as const;

/** The feed filters read from and written to the URL. */
export function useFeedFilters() {
  const [raw, setRaw] = useQueryStates(feedSearchParams, URL_OPTIONS);
  const { sort, tags, kinds, sources, q } = raw;
  const filters = useMemo(
    () => toFeedFilters({ sort, tags, kinds, sources, q }),
    [sort, tags, kinds, sources, q],
  );

  function setSort(next: typeof sort) {
    return setRaw({ sort: next });
  }
  function toggleTag(slug: TagSlug) {
    return setRaw({ tags: toggleValue(filters.tags, slug) });
  }
  function toggleKind(kind: SourceKind) {
    return setRaw({ kinds: toggleValue(filters.kinds, kind) });
  }
  function removeSource(slug: string) {
    return setRaw({ sources: filters.sources.filter((existing) => existing !== slug) });
  }
  const setQuery = useCallback((next: string) => setRaw({ q: next }), [setRaw]);
  function clearAll() {
    return setRaw({ tags: null, kinds: null, sources: null, q: null });
  }

  return {
    filters,
    setSort,
    toggleTag,
    toggleKind,
    removeSource,
    setQuery,
    clearAll,
  };
}
