import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
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
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
  };
  limit(
    { ip, headers: requestHeaders, id: 'req' } as unknown as Request,
    response as unknown as Response,
    next,
  );
  return { next, response, headers };
}

describe('createAuthRateLimit', () => {
  it('lets 10 requests per IP through, answers the 11th with 429, and counts IPs separately', () => {
    const limit = createAuthRateLimit();
    for (let sent = 0; sent < AUTH_RATE_LIMIT_PER_MINUTE; sent++) {
      expect(run(limit, '1.1.1.1').next).toHaveBeenCalled();
    }
    const limited = run(limit, '1.1.1.1');
    expect(limited.next).not.toHaveBeenCalled();
    expect(limited.response.status).toHaveBeenCalledWith(429);
    expect(run(limit, '2.2.2.2').next).toHaveBeenCalled();
  });

  it('has no bypass: the internal token header counts like any other request', () => {
    const limit = createAuthRateLimit();
    for (let sent = 0; sent < AUTH_RATE_LIMIT_PER_MINUTE; sent++) run(limit, '1.1.1.1');
    const withToken = run(limit, '1.1.1.1', { 'x-internal-token': 'local-internal-token' });
    expect(withToken.next).not.toHaveBeenCalled();
    expect(withToken.response.status).toHaveBeenCalledWith(429);
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
    expect(run(limit, '1.1.1.1').next).toHaveBeenCalled();
  });
});
