import {
  A2uiServerMessageSchema,
  EXAMPLE_QUESTIONS,
  type ExampleBriefingList,
} from '@devbrief/shared';
import tsToolingBriefing from '@devbrief/shared/a2ui/fixtures/tsToolingBriefing.json';

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
