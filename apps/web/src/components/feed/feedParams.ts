import { createLoader, parseAsArrayOf, parseAsString, parseAsStringLiteral } from 'nuqs/server';
import {
  FEED_LIST_MAX,
  FEED_QUERY_MAX,
  FEED_QUERY_MIN,
  FEED_SORTS,
  FEED_SOURCE_SLUG_MAX,
  SOURCE_KINDS,
  TAG_SLUGS,
} from '@devbrief/shared';
import type { FeedQuery, SourceKind, TagSlug } from '@devbrief/shared';

/** The URL is the only source of truth for filters; defaults are omitted from it. */
export const feedSearchParams = {
  sort: parseAsStringLiteral(FEED_SORTS).withDefault('top'),
  tags: parseAsArrayOf(parseAsString).withDefault([]),
  kinds: parseAsArrayOf(parseAsString).withDefault([]),
  sources: parseAsArrayOf(parseAsString).withDefault([]),
  q: parseAsString.withDefault(''),
  focus: parseAsString,
};

export const loadFeedSearchParams = createLoader(feedSearchParams);

export type FeedFilters = {
  sort: FeedQuery['sort'];
  tags: TagSlug[];
  kinds: SourceKind[];
  sources: string[];
  q: string;
};

type RawFeedFilters = {
  sort: FeedQuery['sort'];
  tags: string[];
  kinds: string[];
  sources: string[];
  q: string;
};

function unique<T>(values: T[]) {
  return [...new Set(values)].slice(0, FEED_LIST_MAX);
}

function isOneOf<T extends string>(allowed: readonly T[], value: string): value is T {
  return (allowed as readonly string[]).includes(value);
}

/** Drops URL values the API would reject, so a hand-edited URL never produces a 400. */
export function toFeedFilters(raw: RawFeedFilters): FeedFilters {
  return {
    sort: raw.sort,
    tags: unique(raw.tags.filter((tag) => isOneOf(TAG_SLUGS, tag))),
    kinds: unique(raw.kinds.filter((kind) => isOneOf(SOURCE_KINDS, kind))),
    sources: unique(raw.sources.filter((slug) => slug.length <= FEED_SOURCE_SLUG_MAX)),
    q: raw.q.trim().slice(0, FEED_QUERY_MAX),
  };
}

/** The API query for these filters; an empty search is not sent. */
export function toFeedParams(filters: FeedFilters): Partial<FeedQuery> {
  const { sort, tags, kinds, sources, q } = filters;
  return {
    sort,
    ...(tags.length > 0 && { tags }),
    ...(kinds.length > 0 && { kinds }),
    ...(sources.length > 0 && { sources }),
    ...(q.length >= FEED_QUERY_MIN && { q }),
  };
}

/** The chips shown in "Filters (n)": tags, kinds and sources, not the search text. */
export function countActiveFilters({ tags, kinds, sources }: FeedFilters) {
  return tags.length + kinds.length + sources.length;
}

/** True when a chip, or a search the API actually receives, narrows the feed. */
export function hasActiveFilters(filters: FeedFilters) {
  return countActiveFilters(filters) > 0 || filters.q.length >= FEED_QUERY_MIN;
}

/** Adds the value when absent, removes it when present. */
export function toggleValue<T>(values: readonly T[], value: T) {
  return values.includes(value)
    ? values.filter((existing) => existing !== value)
    : [...values, value];
}
