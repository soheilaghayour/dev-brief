import { Global, Module } from '@nestjs/common';
import { LruCache } from './lru.cache.js';

/** Provides the one in-process LruCache to every module. */
@Global()
@Module({ providers: [LruCache], exports: [LruCache] })
export class CacheModule {}
