import { ThrottlerException } from '@nestjs/throttler';
import type { Response } from 'express';
import { RATE_LIMIT_WINDOW_MS, type RateLimitWindows } from './userRateLimit.module.js';

/** Counts one hit in the key's window, sets the `RateLimit-*` headers PRD §6.1 names and throws when the window is over its limit. */
export function enforceWindowLimit(
  windows: RateLimitWindows,
  response: Response,
  { key, perMinute }: { key: string; perMinute: number },
) {
  const now = Date.now();
  const window = windows.hit(key, now);
  const secondsToReset = String(Math.ceil((window.startedAt + RATE_LIMIT_WINDOW_MS - now) / 1000));
  response.setHeader('RateLimit-Limit', String(perMinute));
  response.setHeader('RateLimit-Remaining', String(Math.max(0, perMinute - window.count)));
  response.setHeader('RateLimit-Reset', secondsToReset);
  if (window.count <= perMinute) return;
  response.setHeader('Retry-After', secondsToReset);
  throw new ThrottlerException();
}
