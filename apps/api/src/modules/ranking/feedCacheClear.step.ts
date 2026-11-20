import { Injectable, type OnModuleInit } from '@nestjs/common';
import { LruCache } from '../../common/cache/lru.cache.js';
import { IngestionPostRunSteps, type IngestionPostRunStep } from '../ingestion/postRunStep.js';

/** Clears the cached reads after the other post-run steps, so readers see the new scores and summaries. */
@Injectable()
export class FeedCacheClearStep implements IngestionPostRunStep, OnModuleInit {
  readonly name = 'feed-cache-clear';

  constructor(
    private readonly cache: LruCache,
    private readonly postRunSteps: IngestionPostRunSteps,
  ) {}

  onModuleInit() {
    this.postRunSteps.register(this);
  }

  // The engine runs every step even after one failed, and a failed recompute may still have committed some batches.
  async run() {
    this.cache.clear();
  }
}
