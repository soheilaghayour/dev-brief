import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CACHE_MAX_ENTRIES, LruCache } from './lru.cache.js';

describe('LruCache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns a stored value until its TTL expires', () => {
    const cache = new LruCache();
    cache.set('feed', { items: 1 }, 60_000);
    expect(cache.get('feed')).toEqual({ items: 1 });
    vi.advanceTimersByTime(59_999);
    expect(cache.get('feed')).toEqual({ items: 1 });
    vi.advanceTimersByTime(1);
    expect(cache.get('feed')).toBeUndefined();
  });

  it('keeps a separate TTL per entry', () => {
    const cache = new LruCache();
    cache.set('short', 1, 1_000);
    cache.set('long', 2, 10_000);
    vi.advanceTimersByTime(5_000);
    expect(cache.get('short')).toBeUndefined();
    expect(cache.get('long')).toBe(2);
  });

  it('evicts the least recently used entry beyond the max size', () => {
    const cache = new LruCache();
    for (let index = 0; index < CACHE_MAX_ENTRIES; index++) cache.set(`k${index}`, index, 60_000);
    cache.get('k0'); // k0 is now the most recently used; k1 is the oldest
    cache.set('extra', 'x', 60_000);
    expect(cache.get('k1')).toBeUndefined();
    expect(cache.get('k0')).toBe(0);
    expect(cache.get('extra')).toBe('x');
  });

  it('clear() removes every entry', () => {
    const cache = new LruCache();
    cache.set('a', 1, 60_000);
    cache.set('b', 2, 60_000);
    cache.clear();
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBeUndefined();
  });
});
