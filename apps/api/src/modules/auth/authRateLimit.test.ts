import type { Request, Response } from 'express';
import { ThrottlerException } from '@nestjs/throttler';
import { describe, expect, it, vi } from 'vitest';
import { INTERNAL_TOKEN_HEADER } from '../../common/rate-limit/rateLimit.guard.js';
import { AUTH_RATE_LIMIT_PER_MINUTE, createAuthRateLimit } from './authRateLimit.js';

function run(
  limit: ReturnType<typeof createAuthRateLimit>,
  ip: string,
  requestHeaders: Record<string, string> = {},
) {
  const next = vi.fn();
  const headers = new Map<string, string>();
  const response = {
    setHeader: vi.fn((name: string, value: string) => headers.set(name, value)),
  };
  limit(
    { ip, headers: requestHeaders, id: 'req' } as unknown as Request,
    response as unknown as Response,
    next,
  );
  // The 429 is the error filter's job: the limiter hands it a ThrottlerException.
  const isLimited = next.mock.calls.some(([error]) => error instanceof ThrottlerException);
  return { next, headers, isLimited, isPassed: next.mock.calls.some((call) => call.length === 0) };
}

describe('createAuthRateLimit', () => {
  it('lets 10 requests per IP through, answers the 11th with 429, and counts IPs separately', () => {
    const limit = createAuthRateLimit();
    for (let sent = 0; sent < AUTH_RATE_LIMIT_PER_MINUTE; sent++) {
      expect(run(limit, '1.1.1.1').isPassed).toBe(true);
    }
    expect(run(limit, '1.1.1.1').isLimited).toBe(true);
    expect(run(limit, '2.2.2.2').isPassed).toBe(true);
  });

  it('has no bypass: the internal token header counts like any other request', () => {
    const limit = createAuthRateLimit();
    for (let sent = 0; sent < AUTH_RATE_LIMIT_PER_MINUTE; sent++) run(limit, '1.1.1.1');
    expect(
      run(limit, '1.1.1.1', { [INTERNAL_TOKEN_HEADER]: 'local-internal-token' }).isLimited,
    ).toBe(true);
  });

  it('sends RateLimit-Limit, RateLimit-Remaining and RateLimit-Reset on every response', () => {
    let time = 0;
    const limit = createAuthRateLimit(() => time);
    expect(Object.fromEntries(run(limit, '1.1.1.1').headers)).toEqual({
      'RateLimit-Limit': String(AUTH_RATE_LIMIT_PER_MINUTE),
      'RateLimit-Remaining': String(AUTH_RATE_LIMIT_PER_MINUTE - 1),
      'RateLimit-Reset': '60',
    });
    time = 45_000;
    for (let sent = 1; sent < AUTH_RATE_LIMIT_PER_MINUTE; sent++) run(limit, '1.1.1.1');
    const limited = run(limit, '1.1.1.1');
    expect(limited.headers.get('RateLimit-Remaining')).toBe('0');
    expect(limited.headers.get('RateLimit-Reset')).toBe('15');
    expect(limited.headers.get('Retry-After')).toBe('15');
  });

  it('starts a fresh window after a minute', () => {
    let time = 0;
    const limit = createAuthRateLimit(() => time);
    for (let sent = 0; sent <= AUTH_RATE_LIMIT_PER_MINUTE; sent++) run(limit, '1.1.1.1');
    time = 60_000;
    expect(run(limit, '1.1.1.1').isPassed).toBe(true);
  });

  it('forgets an expired window when a new one starts', () => {
    let time = 0;
    const limit = createAuthRateLimit(() => time);
    for (let sent = 0; sent <= AUTH_RATE_LIMIT_PER_MINUTE; sent++) run(limit, '1.1.1.1');
    time = 30_000;
    run(limit, '2.2.2.2');
    time = 61_000;
    // 1.1.1.1's window expired and was dropped; 2.2.2.2's is still open and keeps counting.
    for (let sent = 1; sent < AUTH_RATE_LIMIT_PER_MINUTE; sent++) run(limit, '2.2.2.2');
    expect(run(limit, '2.2.2.2').isLimited).toBe(true);
    expect(run(limit, '1.1.1.1').isPassed).toBe(true);
  });
});
