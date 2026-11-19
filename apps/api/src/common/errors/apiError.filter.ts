import { Catch, HttpException, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { InvalidCursorError, type ApiErrorBody } from '@devbrief/shared';
import type { Request, Response } from 'express';
import { API_ERROR_STATUS, ApiException } from './api.exception.js';

type ApiErrorDetail = Omit<ApiErrorBody['error'], 'requestId'>;

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
  if (exception instanceof HttpException && exception.getStatus() === 404) {
    return { code: 'NOT_FOUND', message: 'Not found.' };
  }
  if (exception instanceof HttpException && exception.getStatus() === 401) {
    return { code: 'UNAUTHENTICATED', message: 'Sign in to continue.' };
  }
  return { code: 'INTERNAL', message: 'Something went wrong.' };
}

/** Turns every thrown error into the ApiErrorSchema envelope with the request id. */
@Catch()
export class ApiErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const detail = toApiErrorDetail(exception);
    if (detail.code === 'INTERNAL') request.log.error(exception);
    const body: ApiErrorBody = { error: { ...detail, requestId: String(request.id) } };
    response.status(API_ERROR_STATUS[detail.code]).json(body);
  }
}
