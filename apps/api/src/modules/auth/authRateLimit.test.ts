import type { Request, Response } from 'express';
import { ThrottlerException } from '@nestjs/throttler';
import { describe, expect, it, vi } from 'vitest';
import { INTERNAL_TOKEN_HEADER } from '../../common/rate-limit/rateLimit.guard.js';
import { AUTH_RATE_LIMIT_PER_MINUTE, createAuthRateLimit } from './authRateLimit.js';

const TOKEN = 'ci-internal-token-0123';
const ENV_PRODUCTION = { AUTH_TEST_MODE: false, INTERNAL_API_TOKEN: TOKEN };
const ENV_TEST_MODE = { AUTH_TEST_MODE: true, INTERNAL_API_TOKEN: TOKEN };

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
    const limit = createAuthRateLimit(ENV_PRODUCTION);
    for (let sent = 0; sent < AUTH_RATE_LIMIT_PER_MINUTE; sent++) {
      expect(run(limit, '1.1.1.1').isPassed).toBe(true);
    }
    expect(run(limit, '1.1.1.1').isLimited).toBe(true);
    expect(run(limit, '2.2.2.2').isPassed).toBe(true);
  });

  it('counts the internal token like any other request unless the API is in test mode', () => {
    const limit = createAuthRateLimit(ENV_PRODUCTION);
    for (let sent = 0; sent < AUTH_RATE_LIMIT_PER_MINUTE; sent++) run(limit, '1.1.1.1');
    expect(run(limit, '1.1.1.1', { [INTERNAL_TOKEN_HEADER]: TOKEN }).isLimited).toBe(true);
  });

  it('in test mode, skips the limit for a request with the right internal token only', () => {
    const limit = createAuthRateLimit(ENV_TEST_MODE);
    const withToken = { [INTERNAL_TOKEN_HEADER]: TOKEN };
    for (let sent = 0; sent <= AUTH_RATE_LIMIT_PER_MINUTE * 2; sent++) {
      expect(run(limit, '1.1.1.1', withToken).isPassed).toBe(true);
    }
    // The skipped requests did not use the budget of the IP.
    for (let sent = 0; sent < AUTH_RATE_LIMIT_PER_MINUTE; sent++) run(limit, '1.1.1.1');
    expect(run(limit, '1.1.1.1', withToken).isPassed).toBe(true);
    expect(run(limit, '1.1.1.1').isLimited).toBe(true);
    expect(
      run(limit, '1.1.1.1', { [INTERNAL_TOKEN_HEADER]: 'wrong-internal-token' }).isLimited,
    ).toBe(true);
  });

  it('sends RateLimit-Limit, RateLimit-Remaining and RateLimit-Reset on every response', () => {
    let time = 0;
    const limit = createAuthRateLimit(ENV_PRODUCTION, () => time);
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
    const limit = createAuthRateLimit(ENV_PRODUCTION, () => time);
    for (let sent = 0; sent <= AUTH_RATE_LIMIT_PER_MINUTE; sent++) run(limit, '1.1.1.1');
    time = 60_000;
    expect(run(limit, '1.1.1.1').isPassed).toBe(true);
  });

  it('forgets an expired window when a new one starts', () => {
    let time = 0;
    const limit = createAuthRateLimit(ENV_PRODUCTION, () => time);
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
