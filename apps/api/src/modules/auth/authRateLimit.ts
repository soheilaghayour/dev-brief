import type { NextFunction, Request, Response } from 'express';
import { hasInternalToken } from '../../common/rate-limit/rateLimit.guard.js';

export const AUTH_RATE_LIMIT_PER_MINUTE = 10;
const WINDOW_MS = 60_000;

type Window = { startedAt: number; count: number };

/** Limits all of /api/auth/* to 10 requests per client IP per minute; Nest's throttler never sees this raw middleware. */
export function createAuthRateLimit(internalToken: string, now: () => number = Date.now) {
  const windows = new Map<string, Window>();

  return (request: Request, response: Response, next: NextFunction) => {
    if (hasInternalToken(request, internalToken)) return next();
    const currentTime = now();
    const key = request.ip ?? 'unknown';
    let window = windows.get(key);
    if (!window || currentTime - window.startedAt >= WINDOW_MS) {
      window = { startedAt: currentTime, count: 0 };
      windows.set(key, window);
      // Expired windows of other clients are dropped whenever a new one starts, so the map stays small.
      for (const [otherKey, other] of windows) {
        if (currentTime - other.startedAt >= WINDOW_MS) windows.delete(otherKey);
      }
    }
    window.count += 1;
    if (window.count <= AUTH_RATE_LIMIT_PER_MINUTE) return next();
    response.setHeader(
      'Retry-After',
      String(Math.ceil((window.startedAt + WINDOW_MS - currentTime) / 1000)),
    );
    response.setHeader('Cache-Control', 'private, no-store');
    response.status(429).json({
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many requests. Try again shortly.',
        requestId: String(request.id),
      },
    });
  };
}
