import { createLoader, parseAsArrayOf, parseAsString, parseAsStringLiteral } from 'nuqs/server';
import { SourceKindSchema, TagSlugSchema } from '@devbrief/shared';
import type { FeedQuery, SourceKind, TagSlug } from '@devbrief/shared';

/** The URL is the only source of truth for filters; defaults are omitted from it. */
export const feedSearchParams = {
  sort: parseAsStringLiteral(['top', 'latest'] as const).withDefault('top'),
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

const MAX_LIST_LENGTH = 20;
const MAX_SOURCE_SLUG_LENGTH = 64;
const MIN_QUERY_LENGTH = 2;

function unique<T>(values: T[]) {
  return [...new Set(values)].slice(0, MAX_LIST_LENGTH);
}

/** Drops URL values the API would reject, so a hand-edited URL never produces a 400. */
export function toFeedFilters(raw: RawFeedFilters): FeedFilters {
  return {
    sort: raw.sort,
    tags: unique(
      raw.tags.flatMap((tag) => {
        const parsed = TagSlugSchema.safeParse(tag);
        return parsed.success ? [parsed.data] : [];
      }),
    ),
    kinds: unique(
      raw.kinds.flatMap((kind) => {
        const parsed = SourceKindSchema.safeParse(kind);
        return parsed.success ? [parsed.data] : [];
      }),
    ),
    sources: unique(raw.sources.filter((slug) => slug.length <= MAX_SOURCE_SLUG_LENGTH)),
    q: raw.q.trim(),
  };
}

/** The API query for these filters; a search shorter than 2 characters is not sent. */
export function toFeedParams(filters: FeedFilters): Partial<FeedQuery> {
  const { sort, tags, kinds, sources, q } = filters;
  return {
    sort,
    ...(tags.length > 0 && { tags }),
    ...(kinds.length > 0 && { kinds }),
    ...(sources.length > 0 && { sources }),
    ...(q.length >= MIN_QUERY_LENGTH && { q }),
  };
}

/** The chips shown in "Filters (n)": tags, kinds and sources, not the search text. */
export function countActiveFilters({ tags, kinds, sources }: FeedFilters) {
  return tags.length + kinds.length + sources.length;
}

export function hasActiveFilters(filters: FeedFilters) {
  return countActiveFilters(filters) > 0 || filters.q.length > 0;
}

/** Adds the value when absent, removes it when present. */
export function toggleValue<T>(values: readonly T[], value: T) {
  return values.includes(value)
    ? values.filter((existing) => existing !== value)
    : [...values, value];
}
