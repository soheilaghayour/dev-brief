import {
  A2uiServerMessageSchema,
  EXAMPLE_QUESTIONS,
  type ExampleBriefingList,
} from '@devbrief/shared';
import tsToolingBriefing from '@devbrief/shared/a2ui/fixtures/tsToolingBriefing.json';
import type { BriefingSource } from '@/features/copilot/BriefingView';

/** One stored briefing: its question and the A2UI messages that render it. */
export type ExampleBriefing = ExampleBriefingList['items'][number];

/** The shared fixture under the first example question: the landing's sample when no stored briefing exists (PRD §8.7). */
export function sampleExampleBriefings(): ExampleBriefing[] {
  const [first] = EXAMPLE_QUESTIONS;
  return [
    {
      slug: first.slug,
      question: first.question,
      messages: A2uiServerMessageSchema.array().parse(tsToolingBriefing),
    },
  ];
}

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
