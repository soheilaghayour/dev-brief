import { Catch, HttpException, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { InvalidCursorError, type ApiError } from '@devbrief/shared';
import type { Request, Response } from 'express';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { PRIVATE_NO_STORE } from '../cache/cacheControl.js';
import { API_ERROR_STATUS, ApiException } from './api.exception.js';

type ApiErrorDetail = Omit<ApiError['error'], 'requestId'>;

// Statuses Nest and Express raise on their own: bad JSON or path encoding, unknown route, oversized body.
const HTTP_STATUS_ERRORS: Partial<Record<number, ApiErrorDetail>> = {
  400: { code: 'VALIDATION_FAILED', message: 'The request is invalid.' },
  401: { code: 'UNAUTHENTICATED', message: 'Sign in to continue.' },
  404: { code: 'NOT_FOUND', message: 'Not found.' },
  413: { code: 'VALIDATION_FAILED', message: 'The request body is too large.' },
};

// Nest throws HttpException; Express's body parser throws plain errors that carry `status`.
function httpStatusOf(exception: unknown) {
  if (exception instanceof HttpException) return exception.getStatus();
  if (exception instanceof Error && 'status' in exception && typeof exception.status === 'number') {
    return exception.status;
  }
  return undefined;
}

// Anything not recognised becomes INTERNAL so no stack or message of an unexpected error leaks.
function toApiErrorDetail(exception: unknown): ApiErrorDetail {
  if (exception instanceof ApiException) {
    return { code: exception.code, message: exception.message, ...exception.extras };
  }
  if (exception instanceof InvalidCursorError) {
    return { code: 'INVALID_CURSOR', message: 'The cursor is invalid for this request.' };
  }
  if (exception instanceof ThrottlerException) {
    return { code: 'RATE_LIMITED', message: 'Too many requests. Try again shortly.' };
  }
  const status = httpStatusOf(exception);
  return (
    (status && HTTP_STATUS_ERRORS[status]) || {
      code: 'INTERNAL',
      message: 'Something went wrong.',
    }
  );
}

/** Turns every thrown error into the ApiErrorSchema envelope with the request id. */
@Catch()
export class ApiErrorFilter implements ExceptionFilter {
  // Not request.log: body-parser errors arrive before the request logger exists.
  constructor(@InjectPinoLogger(ApiErrorFilter.name) private readonly logger: PinoLogger) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const detail = toApiErrorDetail(exception);
    const requestId = String(request.id);
    if (detail.code === 'INTERNAL') {
      this.logger.error({ err: exception, requestId }, 'Unhandled error');
    }
    const body: ApiError = { error: { ...detail, requestId } };
    // A handler may have set a public Cache-Control before it threw; an error must never be cached.
    response.setHeader('Cache-Control', PRIVATE_NO_STORE);
    response.status(API_ERROR_STATUS[detail.code]).json(body);
  }
}
