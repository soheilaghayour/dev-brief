import { Injectable } from '@nestjs/common';

export const CACHE_MAX_ENTRIES = 500;

/** How long feed, tags and sources responses stay in the LRU (PRD §8.4). */
export const CACHE_TTL_MS = 60_000;

type Entry = { value: unknown; expiresAt: number };

/** An in-memory LRU with a per-entry TTL, for feed, tags and sources responses. */
@Injectable()
export class LruCache {
  // A Map iterates in insertion order, so the first key is the least recently used.
  private readonly entries = new Map<string, Entry>();

  get<T>(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    this.entries.delete(key);
    if (entry.expiresAt <= Date.now()) return undefined;
    this.entries.set(key, entry);
    return entry.value as T;
  }

  set(key: string, value: unknown, ttlMs: number) {
    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt: Date.now() + ttlMs });
    if (this.entries.size > CACHE_MAX_ENTRIES) {
      const leastRecentlyUsed = this.entries.keys().next().value;
      if (leastRecentlyUsed !== undefined) this.entries.delete(leastRecentlyUsed);
    }
  }

  clear() {
    this.entries.clear();
  }
}
