import type { SourceKind } from '@devbrief/shared';

export const SOURCE_KIND_LABELS = {
  hn: 'Hacker News',
  devto: 'Dev.to',
  rss: 'Blogs',
  github: 'GitHub',
} satisfies Record<SourceKind, string>;

/** The kinds the filter offers; GitHub arrives with its adapter in Phase 2. */
export const FILTER_KINDS = ['hn', 'devto', 'rss'] as const satisfies readonly SourceKind[];
