'use client';

import { useQuery } from '@tanstack/react-query';
import { ApiError } from '@/lib/api/apiError';

export const ME_QUERY_KEY = ['me'] as const;

/** The signed-in user, or null for a guest: a 401 from /me is the guest mode, not an error. */
export async function fetchMe() {
  // Loaded on demand like feedQueries: the endpoints pull in Zod, which first paint does not need.
  const { getMe } = await import('@/lib/api/endpoints');
  try {
    return await getMe();
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

export function useMe() {
  return useQuery({ queryKey: ME_QUERY_KEY, queryFn: fetchMe });
}
