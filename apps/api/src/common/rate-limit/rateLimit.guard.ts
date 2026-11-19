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

/** Throttles per client IP and sends the `RateLimit-*` headers PRD §6.1 names instead of the library's `X-RateLimit-*`. */
@Injectable()
export class RateLimitGuard extends ThrottlerGuard {
  protected override headerPrefix = 'RateLimit';

  @Inject(ENV) private readonly env!: Env;

  // Server-side calls from the web app carry no visitor IP, so they would all share one bucket.
  protected override async shouldSkip(context: ExecutionContext) {
    const supplied = context.switchToHttp().getRequest<Request>().headers[INTERNAL_TOKEN_HEADER];
    return (
      typeof supplied === 'string' &&
      timingSafeEqual(sha256(supplied), sha256(this.env.INTERNAL_API_TOKEN))
    );
  }
}
