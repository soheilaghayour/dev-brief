import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { AUTH_RATE_LIMIT_PER_MINUTE, createAuthRateLimit } from './authRateLimit.js';

function run(limit: ReturnType<typeof createAuthRateLimit>, ip: string) {
  const next = vi.fn();
  const response = { setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() };
  limit(
    { ip, headers: {}, id: 'req' } as unknown as Request,
    response as unknown as Response,
    next,
  );
  return { next, response };
}

describe('createAuthRateLimit', () => {
  it('lets 10 requests per IP through, answers the 11th with 429, and counts IPs separately', () => {
    const limit = createAuthRateLimit('local-internal-token');
    for (let sent = 0; sent < AUTH_RATE_LIMIT_PER_MINUTE; sent++) {
      expect(run(limit, '1.1.1.1').next).toHaveBeenCalled();
    }
    const limited = run(limit, '1.1.1.1');
    expect(limited.next).not.toHaveBeenCalled();
    expect(limited.response.status).toHaveBeenCalledWith(429);
    expect(run(limit, '2.2.2.2').next).toHaveBeenCalled();
  });

  it('starts a fresh window after a minute', () => {
    let time = 0;
    const limit = createAuthRateLimit('local-internal-token', () => time);
    for (let sent = 0; sent <= AUTH_RATE_LIMIT_PER_MINUTE; sent++) run(limit, '1.1.1.1');
    time = 60_000;
    expect(run(limit, '1.1.1.1').next).toHaveBeenCalled();
  });
});
