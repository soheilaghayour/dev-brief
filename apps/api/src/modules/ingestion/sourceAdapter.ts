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
  stars: number | null;
  sourceTags: string[];
  excerpt: string | null;
  readingTimeMinutes: number | null;
}

/** The cache validators a conditional GET sends next time; stored on the Source once its items are saved. */
export interface CacheValidators {
  etag: string | null;
  lastModified: string | null;
}

export interface FetchContext {
  signal: AbortSignal;
  /** Asks the engine to store these on the Source after the run's items are saved. */
  rememberValidators?: (validators: CacheValidators) => void;
  /** Tells the engine the items are usable but incomplete; the source run is then recorded as `partial`. */
  reportPartial?: (reason: string) => void;
}

export interface SourceAdapter {
  readonly kind: SourceKind;
  /** Why the adapter can't run, such as missing configuration; the engine then records the source as skipped. */
  unavailableReason?(): string | null;
  /** Fetches and parses one source; throws when the source as a whole failed. */
  fetch(source: Source, context: FetchContext): Promise<RawItem[]>;
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
