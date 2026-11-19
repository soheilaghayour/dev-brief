import { describe, expect, it } from 'vitest';
import { dehydrate } from '@tanstack/react-query';
import { makeQueryClient } from './queryClient';

describe('makeQueryClient', () => {
  it('uses a 60 s staleTime and 2 retries for queries, none for mutations', () => {
    const defaults = makeQueryClient().getDefaultOptions();
    expect(defaults.queries?.staleTime).toBe(60_000);
    expect(defaults.queries?.retry).toBe(2);
    expect(defaults.mutations?.retry).toBe(0);
  });

  it('dehydrates a pending query so server prefetches can stream', () => {
    const client = makeQueryClient();
    void client.prefetchQuery({ queryKey: ['feed'], queryFn: () => new Promise(() => {}) });
    expect(dehydrate(client).queries.map((query) => query.queryKey)).toEqual([['feed']]);
  });
});
