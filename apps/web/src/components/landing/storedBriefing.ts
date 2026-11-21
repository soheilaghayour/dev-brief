// Client-safe: the landing's first load must not pull in Zod or the fixture through this file.
import type { BriefingSource } from '@/features/copilot/BriefingView';

/** A stored array as a briefing source: it replays every message when the view subscribes. */
export function storedBriefingSource(messages: readonly unknown[]): BriefingSource {
  return {
    subscribe(push) {
      messages.forEach(push);
      return () => {};
    },
  };
}

/** The tab a key moves to (arrows wrap, Home and End jump), or `undefined` for any other key. */
export function nextTabIndex(key: string, current: number, count: number) {
  if (key === 'ArrowRight') return (current + 1) % count;
  if (key === 'ArrowLeft') return (current - 1 + count) % count;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return undefined;
}
