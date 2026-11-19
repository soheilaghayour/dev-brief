import { ThrottlerException } from '@nestjs/throttler';
import type { NextFunction, Request, Response } from 'express';

export const AUTH_RATE_LIMIT_PER_MINUTE = 10;
const WINDOW_MS = 60_000;

type Window = { startedAt: number; count: number };

/** Limits all of /api/auth/* to 10 requests per client IP per minute; Nest's throttler never sees this raw middleware. */
export function createAuthRateLimit(now: () => number = Date.now) {
  // Re-inserted on every new window, so iteration order is oldest window first.
  const windows = new Map<string, Window>();

  function dropExpired(currentTime: number) {
    for (const [key, window] of windows) {
      if (currentTime - window.startedAt < WINDOW_MS) return;
      windows.delete(key);
    }
  }

  return (request: Request, response: Response, next: NextFunction) => {
    const currentTime = now();
    const key = request.ip ?? 'unknown';
    let window = windows.get(key);
    if (!window || currentTime - window.startedAt >= WINDOW_MS) {
      windows.delete(key);
      dropExpired(currentTime);
      window = { startedAt: currentTime, count: 0 };
      windows.set(key, window);
    }
    window.count += 1;
    const secondsToReset = String(Math.ceil((window.startedAt + WINDOW_MS - currentTime) / 1000));
    response.setHeader('RateLimit-Limit', String(AUTH_RATE_LIMIT_PER_MINUTE));
    response.setHeader(
      'RateLimit-Remaining',
      String(Math.max(0, AUTH_RATE_LIMIT_PER_MINUTE - window.count)),
    );
    response.setHeader('RateLimit-Reset', secondsToReset);
    if (window.count <= AUTH_RATE_LIMIT_PER_MINUTE) return next();
    response.setHeader('Retry-After', secondsToReset);
    // The API's error filter renders it as the RATE_LIMITED envelope, like the global limit's.
    next(new ThrottlerException());
  };
}
