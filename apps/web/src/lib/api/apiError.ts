import type { ApiError as ApiErrorBody, ApiErrorCode } from '@devbrief/shared';

/** An error response from the API, carrying the contract's code and request id. */
export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly requestId: string,
    readonly status: number,
    readonly details: ApiErrorBody['error']['details'],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** A response that is not valid JSON or does not match its shared schema: a contract breach, not an API error. */
export class ApiResponseError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiResponseError';
  }
}
