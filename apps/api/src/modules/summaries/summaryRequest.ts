import {
  buildStorySummaryPrompt,
  commentBlockTokens,
  INPUT_BUDGET,
  SYSTEM_PROMPT,
} from '../llm/prompts/storySummary.v1.js';
import { flattenComments } from './flattenComments.js';
import type { SummaryInputs } from './summaryInputs.service.js';

/** The prompt for a story's inputs, with its comments trimmed to their budget, and how many comments made it in. */
export function summaryRequest({ title, text, threads }: Omit<SummaryInputs, 'storyId'>) {
  const comments = flattenComments(threads, {
    maxTokens: INPUT_BUDGET.comments,
    tokensOf: commentBlockTokens,
  });
  return {
    system: SYSTEM_PROMPT,
    prompt: buildStorySummaryPrompt({ title, text, comments }),
    basedOnComments: comments.length,
  };
}
