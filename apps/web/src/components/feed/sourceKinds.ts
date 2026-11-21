import type { SourceKind } from '@devbrief/shared';

export const SOURCE_KIND_LABELS = {
  hn: 'Hacker News',
  devto: 'Dev.to',
  rss: 'Blogs',
  github: 'GitHub',
} satisfies Record<SourceKind, string>;

/** The one order sources appear in wherever kinds are listed side by side. */
export const SOURCE_KIND_ORDER = ['hn', 'devto', 'rss', 'github'] as const satisfies SourceKind[];
