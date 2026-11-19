import { describe, expect, it } from 'vitest';
import { formatRelativeTime } from './formatRelativeTime';

const NOW = new Date('2026-11-19T12:00:00Z');
const ago = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString();

describe('formatRelativeTime', () => {
  it('AC-1.3.7 uses the largest whole unit in the short style', () => {
    expect(formatRelativeTime(ago(0.2), NOW)).toBe('now');
    expect(formatRelativeTime(ago(12), NOW)).toBe('12m');
    expect(formatRelativeTime(ago(185), NOW)).toBe('3h');
    expect(formatRelativeTime(ago(60 * 49), NOW)).toBe('2d');
  });

  it('AC-1.3.11 spells units out in the long style', () => {
    expect(formatRelativeTime(ago(14), NOW, 'long')).toBe('14 min ago');
    expect(formatRelativeTime(ago(180), NOW, 'long')).toBe('3 h ago');
    expect(formatRelativeTime(ago(60 * 24), NOW, 'long')).toBe('1 day ago');
    expect(formatRelativeTime(ago(60 * 72), NOW, 'long')).toBe('3 days ago');
    expect(formatRelativeTime(ago(0), NOW, 'long')).toBe('just now');
  });

  it('never goes negative when the clock is behind the server', () => {
    const future = new Date(NOW.getTime() + 5 * 60_000).toISOString();
    expect(formatRelativeTime(future, NOW)).toBe('now');
  });
});
