'use client';

import { useQuery } from '@tanstack/react-query';
import { isoWeekRange, type SavedStoryPage, type StoryCard } from '@devbrief/shared';
import { useSaves } from '@/components/saves/useSaves';

export type DigestSource = { story: StoryCard; savedAt: string; note: string | null };

/** Every save made in or after the week, newest first: pages are read until one reaches back before the week starts. */
async function fetchSavesSince(weekStart: Date) {
  const { getSaves } = await import('@/lib/api/endpoints');
  const sources: DigestSource[] = [];
  let cursor: string | undefined;
  do {
    const page: SavedStoryPage = await getSaves({ cursor });
    for (const item of page.items) {
      sources.push({ story: item.story, savedAt: item.savedAt, note: item.note ?? null });
    }
    const last = page.items[page.items.length - 1];
    const reachedBefore = last !== undefined && new Date(last.savedAt) < weekStart;
    cursor = reachedBefore ? undefined : (page.nextCursor ?? undefined);
  } while (cursor);
  return sources;
}

/**
 * The saves a digest can draw from. A guest's are the stories on the page, with the dates and notes on the device;
 * an account's are fetched for the chosen week, since the page may have loaded only its first saves.
 */
export function useDigestItems(stories: readonly StoryCard[], week: string) {
  const saves = useSaves();
  const isAccount = saves.mode === 'account';
  const query = useQuery({
    queryKey: ['saves', 'digest', week],
    queryFn: () => fetchSavesSince(isoWeekRange(week).start),
    enabled: isAccount,
    // A digest is built from what the account holds now, never from an earlier export's pages.
    gcTime: 0,
  });

  if (isAccount) return { isLoading: query.isPending, items: query.data ?? [] };
  const items = stories.flatMap((story) => {
    const savedAt = saves.savedAt(story.id);
    return savedAt ? [{ story, savedAt, note: saves.note(story.id) }] : [];
  });
  return { isLoading: false, items };
}
