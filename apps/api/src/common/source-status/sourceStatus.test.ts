import { describe, expect, it } from 'vitest';
import { overallStatus, sourceStatus } from './sourceStatus.js';

const now = new Date('2026-06-01T12:00:00Z');
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000);

describe('sourceStatus', () => {
  it('is healthy with a success within 2 hours', () => {
    expect(sourceStatus({ circuitOpenUntil: null, lastSuccessAt: hoursAgo(2) }, now)).toBe(
      'healthy',
    );
  });

  it('is stale after more than 2 hours without a success', () => {
    expect(sourceStatus({ circuitOpenUntil: null, lastSuccessAt: hoursAgo(2.01) }, now)).toBe(
      'stale',
    );
  });

  it('is stale when it never succeeded', () => {
    expect(sourceStatus({ circuitOpenUntil: null, lastSuccessAt: null }, now)).toBe('stale');
  });

  it('is circuit_open while the circuit is open, even after a recent success', () => {
    const circuitOpenUntil = new Date(now.getTime() + 1000);
    expect(sourceStatus({ circuitOpenUntil, lastSuccessAt: hoursAgo(0) }, now)).toBe(
      'circuit_open',
    );
  });

  it('ignores a circuit that has closed', () => {
    expect(sourceStatus({ circuitOpenUntil: now, lastSuccessAt: hoursAgo(1) }, now)).toBe(
      'healthy',
    );
  });
});

describe('overallStatus', () => {
  it('is ok when all sources are healthy or there are none', () => {
    expect(overallStatus(['healthy', 'healthy'])).toBe('ok');
    expect(overallStatus([])).toBe('ok');
  });

  it('is degraded with any stale or circuit_open source', () => {
    expect(overallStatus(['healthy', 'stale'])).toBe('degraded');
    expect(overallStatus(['circuit_open'])).toBe('degraded');
  });
});
