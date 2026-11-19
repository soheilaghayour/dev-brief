import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/apiError';

const getMe = vi.fn();
vi.mock('@/lib/api/endpoints', () => ({ getMe: () => getMe() }));

const { fetchMe } = await import('./useMe');

describe('fetchMe', () => {
  it('returns the user when /me answers', async () => {
    const me = { id: 'u1', name: 'Jane' };
    getMe.mockResolvedValueOnce(me);
    expect(await fetchMe()).toBe(me);
  });

  it('turns a 401 into null, which means guest mode', async () => {
    getMe.mockRejectedValueOnce(new ApiError('UNAUTHENTICATED', 'Sign in', 'r1', 401, undefined));
    expect(await fetchMe()).toBeNull();
  });

  it('rethrows every other failure', async () => {
    const failure = new ApiError('INTERNAL', 'Boom', 'r2', 500, undefined);
    getMe.mockRejectedValueOnce(failure);
    await expect(fetchMe()).rejects.toBe(failure);
  });
});
