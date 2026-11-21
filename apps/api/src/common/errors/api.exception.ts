import { HttpException } from '@nestjs/common';
import type { ApiError, ApiErrorCode } from '@devbrief/shared';

export const API_ERROR_STATUS = {
  VALIDATION_FAILED: 400,
  INVALID_CURSOR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN_ORIGIN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  FEATURE_DISABLED: 404,
  RATE_LIMITED: 429,
  QUOTA_EXCEEDED: 429,
  GENERATION_FAILED: 502,
  SPEND_CAP_REACHED: 503,
  UPSTREAM_UNAVAILABLE: 503,
  INTERNAL: 500,
} as const satisfies Record<ApiErrorCode, number>;

type ApiErrorExtras = Pick<ApiError['error'], 'details' | 'resetsAt'>;

/** An error with a contract code; the filter renders it as ApiErrorSchema with the matching status. */
export class ApiException extends HttpException {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly extras: ApiErrorExtras = {},
  ) {
    super(message, API_ERROR_STATUS[code]);
  }
}
