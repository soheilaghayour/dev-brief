import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

const queryClient = new QueryClient();
const authClient = vi.hoisted(() => ({ signOut: vi.fn() }));
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQueryClient: () => queryClient,
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));
vi.mock('@/lib/guest/clear', () => ({ clearGuestData: vi.fn() }));
vi.mock('./authClient', () => ({ authClient }));

const { useSignOut } = await import('./useSignOut');

describe('useSignOut', () => {
  it('AC-2.5.3 drops the account preferences and saves from the cache, so the next sign-in cannot see them', async () => {
    authClient.signOut.mockResolvedValue({ error: null });
    queryClient.setQueryData(['me'], { id: 'u1' });
    queryClient.setQueryData(['prefs'], { follow: { tags: ['rust'], sources: [] } });
    queryClient.setQueryData(['saves'], ['a']);

    useSignOut()();
    await vi.waitFor(() => expect(queryClient.getQueryData(['me'])).toBeNull());

    expect(queryClient.getQueryData(['prefs'])).toBeUndefined();
    expect(queryClient.getQueryData(['saves'])).toBeUndefined();
  });
});
