'use client';

import { useRouter } from 'next/navigation';
import { useShortcut } from '@/lib/hotkeys/HotkeysProvider';
import type { Shortcut } from '@/lib/hotkeys/shortcutRules';

const SUMMARIZE_ACTIVE = {
  id: 'feed-summarize',
  keys: 'u',
  description: 'Summarize active story',
  scope: 'Feed',
} satisfies Shortcut;

/** Binds `u` on the feed: the story page starts the summary, since a card has no room to show it. */
export function SummarizeShortcut({ storyId }: { storyId: string }) {
  const router = useRouter();

  function openAndSummarize() {
    router.push(`/story/${encodeURIComponent(storyId)}?summarize=1`);
  }

  useShortcut(SUMMARIZE_ACTIVE, openAndSummarize);
  return null;
}
