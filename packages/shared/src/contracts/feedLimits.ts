// Kept apart from the Zod schemas so web code can import the limits without pulling Zod into first-load JS.
export const FEED_SORTS = ['top', 'latest'] as const;
export const FEED_LIST_MAX = 20;
export const FEED_SOURCE_SLUG_MAX = 64;
export const FEED_QUERY_MIN = 2;
export const FEED_QUERY_MAX = 100;
