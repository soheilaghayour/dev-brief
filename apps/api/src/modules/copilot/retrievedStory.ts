import type { SourceRef } from '@devbrief/shared';

/** A story retrieved for a question, with what the prompt and the compiler need. */
export type RetrievedStory = {
  id: string;
  /** Null unless the story belongs to a cluster of at least two stories. */
  clusterId: string | null;
  title: string;
  url: string;
  domain: string;
  /** ISO 8601 UTC. */
  publishedAt: string;
  tags: string[];
  excerpt: string | null;
  sources: SourceRef[];
  /** The cached `Summary.tldr`, or null when the story has none. */
  tldr: string[] | null;
};
