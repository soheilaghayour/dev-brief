'use client';

import { useCallback, useMemo } from 'react';
import { useQueryStates } from 'nuqs';
import type { SourceKind, TagSlug } from '@devbrief/shared';
import { feedSearchParams, toFeedFilters, toggleValue } from './feedParams';

// Filter changes replace the history entry, so Back leaves the feed instead of stepping through filters.
const URL_OPTIONS = { history: 'replace' } as const;

/** The feed filters read from and written to the URL; every change also drops the one-shot `focus`. */
export function useFeedFilters() {
  const [raw, setRaw] = useQueryStates(feedSearchParams, URL_OPTIONS);
  const { sort, tags, kinds, sources, q, focus } = raw;
  const filters = useMemo(
    () => toFeedFilters({ sort, tags, kinds, sources, q }),
    [sort, tags, kinds, sources, q],
  );

  function setSort(next: typeof sort) {
    return setRaw({ sort: next, focus: null });
  }
  function toggleSort() {
    return setSort(sort === 'top' ? 'latest' : 'top');
  }
  function toggleTag(slug: TagSlug) {
    return setRaw({ tags: toggleValue(filters.tags, slug), focus: null });
  }
  function toggleKind(kind: SourceKind) {
    return setRaw({ kinds: toggleValue(filters.kinds, kind), focus: null });
  }
  function removeSource(slug: string) {
    return setRaw({
      sources: filters.sources.filter((existing) => existing !== slug),
      focus: null,
    });
  }
  const setQuery = useCallback((next: string) => setRaw({ q: next, focus: null }), [setRaw]);
  function clearAll() {
    return setRaw({ tags: null, kinds: null, sources: null, q: null, focus: null });
  }

  return {
    filters,
    focus,
    setSort,
    toggleSort,
    toggleTag,
    toggleKind,
    removeSource,
    setQuery,
    clearAll,
  };
}
