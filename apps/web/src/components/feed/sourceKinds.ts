import type { SourceKind } from '@devbrief/shared';

export const SOURCE_KIND_LABELS = {
  hn: 'Hacker News',
  devto: 'Dev.to',
  rss: 'Blogs',
  github: 'GitHub',
} satisfies Record<SourceKind, string>;
