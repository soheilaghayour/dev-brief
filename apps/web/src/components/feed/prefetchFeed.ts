import type { QueryClient } from '@tanstack/react-query';
import { PREFS_KEY } from '@/components/preferences/preferenceQueries';
import { ApiError } from '@/lib/api/apiError';
import { getMe, getPreferences } from '@/lib/api/endpoints';
import { ME_QUERY_KEY } from '@/lib/auth/meQueryKey';
import { toFeedParams, type PersonalFeedParams } from '@/lib/guest/preferences';
import type { FeedFilters } from './feedParams';
import { feedQueryOptions } from './feedQueries';

const SESSION_COOKIE = 'better-auth.session_token=';

async function meOrNull(cookie: string) {
  try {
    return await getMe({ cookie });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

// A failed call leaves the rest to the browser, which loads the same queries itself.
async function prefetchAccountFeedParams(
  queryClient: QueryClient,
  cookie: string,
): Promise<PersonalFeedParams> {
  try {
    const user = await queryClient.fetchQuery({
      queryKey: ME_QUERY_KEY,
      queryFn: () => meOrNull(cookie),
    });
    if (!user) return {};
    const prefs = await queryClient.fetchQuery({
      queryKey: PREFS_KEY,
      queryFn: () => getPreferences({ cookie }),
    });
    return toFeedParams(prefs);
  } catch {
    return {};
  }
}

/**
 * Prefetches the feed's first page into the cache; for a signed-in visitor it asks for the page their
 * preferences give, so a muted story is never rendered.
 */
export async function prefetchFeed(
  queryClient: QueryClient,
  filters: FeedFilters,
  cookie: string | null,
) {
  const hasSession = cookie?.includes(SESSION_COOKIE);
  const personal = hasSession && cookie ? await prefetchAccountFeedParams(queryClient, cookie) : {};
  await queryClient.prefetchInfiniteQuery(feedQueryOptions(filters, personal));
}
