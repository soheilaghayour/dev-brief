import { Inject, Injectable } from '@nestjs/common';
import type { Source, SourceKind } from '../../generated/prisma/client.js';

/** One upstream item after the adapter has parsed it; the engine maps it to a SourceItem and a Story. */
export interface RawItem {
  externalId: string;
  url: string;
  discussionUrl: string | null;
  title: string;
  author: string | null;
  publishedAt: Date;
  points: number | null;
  commentsCount: number | null;
  reactionsCount: number | null;
  sourceTags: string[];
  excerpt: string | null;
  readingTimeMinutes: number | null;
}

export interface SourceAdapter {
  readonly kind: SourceKind;
  /** Fetches and parses one source; throws when the source as a whole failed. */
  fetch(source: Source, context: { signal: AbortSignal }): Promise<RawItem[]>;
}

export const SOURCE_ADAPTERS = Symbol('SOURCE_ADAPTERS');

/** Finds the adapter for a source kind, so a new source needs no change in the engine. */
@Injectable()
export class AdapterRegistry {
  private readonly adaptersByKind: Map<SourceKind, SourceAdapter>;

  constructor(@Inject(SOURCE_ADAPTERS) adapters: SourceAdapter[]) {
    this.adaptersByKind = new Map(adapters.map((adapter) => [adapter.kind, adapter]));
  }

  forKind(kind: SourceKind) {
    return this.adaptersByKind.get(kind);
  }
}
