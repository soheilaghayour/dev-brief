import { describe, expect, it } from 'vitest';
import { ipDigest } from './ipDigest.js';

const SECRET = 'unit-test-secret-0123456789abcdef0123';

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
