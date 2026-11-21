import {
  buildStorySummaryPrompt,
  commentBlockTokens,
  INPUT_BUDGET,
  StorySummaryLlmSchema,
  SYSTEM_PROMPT,
} from '../llm/prompts/storySummary.v2.js';
import { flattenComments } from './flattenComments.js';
import { longestSharedRun, SUMMARY_MAX_SHARED_WORDS } from './sharedRun.js';
import type { SummaryInputs } from './summaryInputs.service.js';

/** The output schema plus the no-quotation check: a TL;DR point, pro or con sharing 8 or more consecutive words with one source fails it. */
export function noQuotationSchema(sources: readonly string[]) {
  return StorySummaryLlmSchema.superRefine((summary, context) => {
    const written = [
      ...summary.tldr.map((line, index) => ({ line, path: ['tldr', index] })),
      ...(summary.consensus?.pros ?? []).map((line, index) => ({
        line,
        path: ['consensus', 'pros', index],
      })),
      ...(summary.consensus?.cons ?? []).map((line, index) => ({
        line,
        path: ['consensus', 'cons', index],
      })),
    ];
    for (const { line, path } of written) {
      if (longestSharedRun(line, sources) > SUMMARY_MAX_SHARED_WORDS) {
        context.addIssue({
          code: 'custom',
          path,
          message: `repeats ${SUMMARY_MAX_SHARED_WORDS + 1} or more consecutive words of a source: paraphrase it`,
        });
      }
    }
  });
}

/** The request for a story's inputs: its prompt, with comments trimmed to their budget, how many comments made it in, and the output schema checked against the text and those comments (the title is left out). */
export function summaryRequest({ title, text, threads }: Omit<SummaryInputs, 'storyId'>) {
  const comments = flattenComments(threads, {
    maxTokens: INPUT_BUDGET.comments,
    tokensOf: commentBlockTokens,
  });
  return {
    system: SYSTEM_PROMPT,
    prompt: buildStorySummaryPrompt({ title, text, comments }),
    basedOnComments: comments.length,
    // The text is compared whole, not as truncated into the prompt: stricter, and never looser than what the model saw.
    schema: noQuotationSchema(text ? [text, ...comments] : comments),
  };
}
