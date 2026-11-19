import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

export const RATE_LIMIT_PER_MINUTE = 120;

/** Throttles per client IP and sends the `RateLimit-*` headers PRD §6.1 names instead of the library's `X-RateLimit-*`. */
@Injectable()
export class RateLimitGuard extends ThrottlerGuard {
  protected override headerPrefix = 'RateLimit';
}
