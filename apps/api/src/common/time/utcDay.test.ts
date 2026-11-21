import { afterEach, describe, expect, it, vi } from 'vitest';
import { utcDay } from './utcDay.js';

describe('utcDay', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('AC-2.6.1 buckets 23:30 UTC into the same UTC day under TZ=Europe/Berlin', () => {
    vi.stubEnv('TZ', 'Europe/Berlin');
    const lateEvening = new Date('2026-03-10T23:30:00Z');
    // Berlin is already on 11 March, which a local-time bucket would pick.
    expect(lateEvening.getDate()).toBe(11);
    expect(utcDay(lateEvening).toISOString()).toBe('2026-03-10T00:00:00.000Z');
    expect(utcDay(new Date('2026-03-11T00:00:00Z')).toISOString()).toBe('2026-03-11T00:00:00.000Z');
  });
});
