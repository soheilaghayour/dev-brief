import { z } from 'zod';

export const ApiErrorCodeSchema = z.enum([
  'VALIDATION_FAILED', // 400
  'INVALID_CURSOR', // 400
  'UNAUTHENTICATED', // 401
  'FORBIDDEN_ORIGIN', // 403
  'NOT_FOUND', // 404
  'FEATURE_DISABLED', // 404 (phase flag off)
  'RATE_LIMITED', // 429 (short-window throttle)
  'QUOTA_EXCEEDED', // 429 (daily quota)
  'GENERATION_FAILED', // 502
  'SPEND_CAP_REACHED', // 503
  'UPSTREAM_UNAVAILABLE', // 503
  'INTERNAL', // 500
]);
export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;

export const ApiErrorSchema = z.object({
  error: z.object({
    code: ApiErrorCodeSchema,
    message: z.string(),
    details: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
    requestId: z.string(),
    resetsAt: z.string().datetime().optional(),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;
