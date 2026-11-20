import { z } from 'zod';
import { A2uiServerMessageSchema } from '../a2ui/catalog.js';
import { EXAMPLE_QUESTIONS, type ExampleQuestion } from '../a2ui/exampleQuestions.js';
import { ApiErrorCodeSchema } from './error.js';

export const CopilotAskRequestSchema = z.object({
  question: z.string().trim().min(3).max(200),
  deviceId: z.string().uuid(),
});
export type CopilotAskRequest = z.infer<typeof CopilotAskRequestSchema>;

export const CopilotQuotaQuerySchema = z.object({ deviceId: z.string().uuid().optional() });
export type CopilotQuotaQuery = z.infer<typeof CopilotQuotaQuerySchema>;

export const CopilotQuotaSchema = z.object({
  limit: z.number().int().nonnegative(),
  remaining: z.number().int().nonnegative(),
  resetsAt: z.string().datetime(),
});
export type CopilotQuota = z.infer<typeof CopilotQuotaSchema>;

export const CopilotMetaEventSchema = z.object({
  queryId: z.string(),
  cached: z.boolean(),
  fallback: z.enum(['SPEND_CAP', 'NO_COVERAGE']).optional(),
  quota: CopilotQuotaSchema,
});
export type CopilotMetaEvent = z.infer<typeof CopilotMetaEventSchema>;

export const CopilotErrorEventSchema = z.object({ code: ApiErrorCodeSchema, message: z.string() });
export type CopilotErrorEvent = z.infer<typeof CopilotErrorEventSchema>;

export const CopilotDoneEventSchema = z.object({
  usage: z
    .object({
      inputTokens: z.number().int().nonnegative(),
      outputTokens: z.number().int().nonnegative(),
      costUsd: z.number().nonnegative(),
    })
    .optional(),
});
export type CopilotDoneEvent = z.infer<typeof CopilotDoneEventSchema>;

type ExampleSlug = ExampleQuestion['slug'];
const EXAMPLE_SLUGS = EXAMPLE_QUESTIONS.map((example) => example.slug) as [
  ExampleSlug,
  ...ExampleSlug[],
];

export const ExampleBriefingListSchema = z.object({
  items: z.array(
    z.object({
      slug: z.enum(EXAMPLE_SLUGS),
      question: z.string(),
      messages: z.array(A2uiServerMessageSchema),
    }),
  ),
});
export type ExampleBriefingList = z.infer<typeof ExampleBriefingListSchema>;
