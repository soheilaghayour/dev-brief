import { Inject, Injectable, type ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { ENV, type Env } from '../env/env.module.js';

export const RATE_LIMIT_PER_MINUTE = 120;

export const INTERNAL_TOKEN_HEADER = 'x-internal-token';

// Hashing first gives both sides the same length, which timingSafeEqual requires.
function sha256(value: string) {
  return createHash('sha256').update(value).digest();
}

/** True when the request carries the internal token, i.e. it is the web app's own server-side call, not a visitor. */
export function hasInternalToken(request: Request, env: Pick<Env, 'INTERNAL_API_TOKEN'>) {
  const supplied = request.headers[INTERNAL_TOKEN_HEADER];
  return (
    typeof supplied === 'string' &&
    timingSafeEqual(sha256(supplied), sha256(env.INTERNAL_API_TOKEN))
  );
}

/** Throttles per client IP and sends the `RateLimit-*` headers PRD §6.1 names instead of the library's `X-RateLimit-*`. */
@Injectable()
export class RateLimitGuard extends ThrottlerGuard {
  protected override headerPrefix = 'RateLimit';

  @Inject(ENV) private readonly env!: Env;

  // Server-side calls from the web app carry no visitor IP, so they would all share one bucket.
  protected override async shouldSkip(context: ExecutionContext) {
    return hasInternalToken(context.switchToHttp().getRequest<Request>(), this.env);
  }
}
