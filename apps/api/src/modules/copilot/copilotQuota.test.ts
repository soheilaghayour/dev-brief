import { describe, expect, it } from 'vitest';
import { ipDigest } from '../../common/rate-limit/ipDigest.js';
import { copilotQuota, remainingQuota } from './copilotQuota.js';

const SECRET = 'unit-test-secret-0123456789abcdef0123';
const DEVICE = '4f0c1c1e-1b0a-4d27-9a38-3f1c2c0f9a11';

describe('copilotQuota', () => {
  it('AC-3.1.4 gives a user 20 per UTC day under one key', () => {
    const quota = copilotQuota(
      { kind: 'user', userId: 'u1' },
      SECRET,
      new Date('2026-11-20T10:00:00Z'),
    );
    expect(quota.counters).toEqual([{ key: 'copilot:user:u1', limit: 20 }]);
  });

  it('AC-3.1.4 gives a guest 3 per device and 10 per IP, keyed by the IP digest only', () => {
    const now = new Date('2026-11-20T10:00:00Z');
    const quota = copilotQuota({ kind: 'guest', ip: '1.2.3.4', deviceId: DEVICE }, SECRET, now);
    const digest = ipDigest('1.2.3.4', SECRET, now);
    expect(quota.counters).toEqual([
      { key: `copilot:guest:${digest}:${DEVICE}`, limit: 3 },
      { key: `copilot:ip:${digest}`, limit: 10 },
    ]);
    expect(JSON.stringify(quota)).not.toContain('1.2.3.4');
  });

  it('AC-3.1.4 resets at the next UTC midnight at 23:30 UTC under Europe/Berlin', () => {
    const previous = process.env.TZ;
    process.env.TZ = 'Europe/Berlin';
    try {
      const quota = copilotQuota(
        { kind: 'user', userId: 'u1' },
        SECRET,
        new Date('2026-11-20T23:30:00Z'),
      );
      expect(quota.day.toISOString()).toBe('2026-11-20T00:00:00.000Z');
      expect(quota.resetsAt.toISOString()).toBe('2026-11-21T00:00:00.000Z');
    } finally {
      if (previous === undefined) delete process.env.TZ;
      else process.env.TZ = previous;
    }
  });
});

describe('remainingQuota', () => {
  const guest = copilotQuota(
    { kind: 'guest', ip: '1.2.3.4', deviceId: DEVICE },
    SECRET,
    new Date('2026-11-20T10:00:00Z'),
  );

  it('reports the limit of the first counter and what is left in it', () => {
    expect(remainingQuota(guest, [1, 1])).toEqual({
      limit: 3,
      remaining: 2,
      resetsAt: '2026-11-21T00:00:00.000Z',
    });
  });

  it('reports the IP backstop when it is tighter than the device quota', () => {
    expect(remainingQuota(guest, [0, 9]).remaining).toBe(1);
    expect(remainingQuota(guest, [0, 10]).remaining).toBe(0);
  });
});
