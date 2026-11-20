import { describe, expect, it } from 'vitest';
import { GUEST_DAILY_LIMIT, ipDigest, summaryQuota, USER_DAILY_LIMIT } from './summaryQuota.js';

const SECRET = 'unit-test-secret-0123456789abcdef0123';
const DEVICE = '4f0c1c1e-1b0a-4d27-9a38-3f1c2c0f9a11';

describe('summaryQuota', () => {
  it('AC-2.3.3 gives users 20 and guests 5 per UTC day, with the next UTC midnight as reset', () => {
    const now = new Date('2026-11-20T23:30:00Z');
    const user = summaryQuota({ kind: 'user', userId: 'u1' }, SECRET, now);
    const guest = summaryQuota({ kind: 'guest', ip: '1.2.3.4', deviceId: DEVICE }, SECRET, now);

    expect(user).toMatchObject({ key: 'summary:user:u1', limit: USER_DAILY_LIMIT });
    expect(guest.limit).toBe(GUEST_DAILY_LIMIT);
    expect(guest.key).toBe(`summary:guest:${ipDigest('1.2.3.4', SECRET, now)}:${DEVICE}`);
    expect(user.day.toISOString()).toBe('2026-11-20T00:00:00.000Z');
    expect(user.resetsAt.toISOString()).toBe('2026-11-21T00:00:00.000Z');
  });

  it('AC-2.3.3 buckets by the UTC day whatever the process time zone is (23:30 UTC)', () => {
    const previous = process.env.TZ;
    process.env.TZ = 'Europe/Berlin';
    try {
      const quota = summaryQuota(
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

describe('ipDigest', () => {
  it('is stable within a UTC day, differs per IP, and rotates at UTC midnight', () => {
    const morning = new Date('2026-11-20T01:00:00Z');
    const evening = new Date('2026-11-20T23:59:00Z');
    const nextDay = new Date('2026-11-21T00:00:00Z');

    expect(ipDigest('1.2.3.4', SECRET, morning)).toBe(ipDigest('1.2.3.4', SECRET, evening));
    expect(ipDigest('1.2.3.4', SECRET, morning)).not.toBe(ipDigest('1.2.3.5', SECRET, morning));
    expect(ipDigest('1.2.3.4', SECRET, morning)).not.toBe(ipDigest('1.2.3.4', SECRET, nextDay));
    expect(ipDigest('1.2.3.4', SECRET, morning)).not.toContain('1.2.3.4');
  });
});
